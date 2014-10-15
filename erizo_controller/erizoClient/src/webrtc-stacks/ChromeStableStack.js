/*global window, console, RTCSessionDescription, RoapConnection, webkitRTCPeerConnection*/

var Erizo = Erizo || {};

Erizo.ChromeStableStack = function (spec) {
    "use strict";

    var that = {},
        WebkitRTCPeerConnection = webkitRTCPeerConnection;

    that.pc_config = {
        "iceServers": []
    };

    that.con = {'optional': [{'DtlsSrtpKeyAgreement': true}]};

    if (spec.stunServerUrl !== undefined) {
        that.pc_config.iceServers.push({"url": spec.stunServerUrl});
    } 

    if ((spec.turnServer || {}).url) {
        that.pc_config.iceServers.push({"username": spec.turnServer.username, "credential": spec.turnServer.password, "url": spec.turnServer.url});
    }

    if (spec.audio === undefined || spec.nop2p) {
        spec.audio = true;
    }

    if (spec.video === undefined || spec.nop2p) {
        spec.video = true;
    }

    that.mediaConstraints = {
        'mandatory': {
            'OfferToReceiveVideo': spec.video,
            'OfferToReceiveAudio': spec.audio
        }
    };

    that.peerConnection = new WebkitRTCPeerConnection(that.pc_config, that.con);
    
    var setMaxBW = function (sdp) {
        if (spec.maxVideoBW) {
            var a = sdp.match(/m=video.*\r\n/);
            var r = a[0] + "b=AS:" + spec.maxVideoBW + "\r\n";
            sdp = sdp.replace(a[0], r);
        }

        if (spec.maxAudioBW) {
            var a = sdp.match(/m=audio.*\r\n/);
            var r = a[0] + "b=AS:" + spec.maxAudioBW + "\r\n";
            sdp = sdp.replace(a[0], r);
        }

        return sdp;
    };

    /**
     * Closes the connection.
     */
    that.close = function () {
        that.state = 'closed';
        that.peerConnection.close();
    };

    spec.localCandidates = [];

    that.peerConnection.onicecandidate =  function (event) {
        if (event.candidate) {

            if (!event.candidate.candidate.match(/a=/)) {
                console.log('pongo la aaaaaaaaaaa');
                event.candidate.candidate ="a="+event.candidate.candidate;
            };

            if (spec.remoteDescriptionSet) {
                spec.callback({type:'candidate', candidate: event.candidate});
            } else {
                spec.localCandidates.push(event.candidate);
                console.log("Local Candidates stored: ", spec.localCandidates.length, spec.localCandidates);
            }

        } else {
            console.log("End of candidates.");
        }
    };

    that.peerConnection.onaddstream = function (stream) {
        if (that.onaddstream) {
            that.onaddstream(stream);
        }
    };

    that.peerConnection.onremovestream = function (stream) {
        if (that.onremovestream) {
            that.onremovestream(stream);
        }
    };

    var localDesc;

    var setLocalDesc = function (sessionDescription) {
        sessionDescription.sdp = setMaxBW(sessionDescription.sdp);
        sessionDescription.sdp = sessionDescription.sdp.replace(/a=ice-options:google-ice\r\n/g, "");
        spec.callback(sessionDescription);
        localDesc = sessionDescription;
        //that.peerConnection.setLocalDescription(sessionDescription);
    }

    that.createOffer = function () {
        that.peerConnection.createOffer(setLocalDesc, null, that.mediaConstraints);
    };

    that.addStream = function (stream) {
        that.peerConnection.addStream(stream);
    };
    spec.remoteCandidates = [];

    spec.remoteDescriptionSet = false;

    that.processSignalingMessage = function (msg) {
        console.log("Process Signaling Message", msg);

        // if (msg.type === 'offer') {
        //     msg.sdp = setMaxBW(msg.sdp);
        //     that.peerConnection.setRemoteDescription(new RTCSessionDescription(msg));
        //     that.peerConnection.createAnswer(setLocalAndSendMessage, null, sdpConstraints);
        // } else 

        if (msg.type === 'answer') {


            // // For compatibility with only audio in Firefox Revisar
            // if (answer.match(/a=ssrc:55543/)) {
            //     answer = answer.replace(/a=sendrecv\\r\\na=mid:video/, 'a=recvonly\\r\\na=mid:video');
            //     answer = answer.split('a=ssrc:55543')[0] + '"}';
            // }

            console.log("Set remote and local description", msg.sdp);

            //msg.sdp = setMaxBW(msg.sdp);

            that.peerConnection.setLocalDescription(localDesc);
            that.peerConnection.setRemoteDescription(new RTCSessionDescription(msg), function() {
                spec.remoteDescriptionSet = true;
                console.log("Candidates to be added: ", spec.remoteCandidates.length, spec.remoteCandidates);
                while (spec.remoteCandidates.length > 0) {
                    that.peerConnection.addIceCandidate(spec.remoteCandidates.pop());
                }

                while(spec.localCandidates.length > 0) {
                    spec.callback({type:'candidate', candidate: spec.remoteCandidates.pop()});
                }

            });

        } else if (msg.type === 'candidate') {
            try {
                var obj = JSON.parse(msg.candidate);
                obj.candidate = obj.candidate.replace(/a=/g, "");
                obj.sdpMLineIndex = parseInt(obj.sdpMLineIndex);
                var candidate = new RTCIceCandidate(obj);
                if (spec.remoteDescriptionSet) {
                    that.peerConnection.addIceCandidate(candidate);
                } else {
                    spec.remoteCandidates.push(candidate);
//                    console.log("Candidates stored: ", spec.remoteCandidates.length, spec.remoteCandidates);
                }
            } catch(e) {
                L.Logger.error("Error parsing candidate", msg.candidate);
            }
        }
    }

    return that;
};