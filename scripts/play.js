/*
          Get these from WowzaStreamingEngine WebRTC Application
        */
let applicationName = "testLive";
let streamName = "obs-stream";
let wssUrl = "wss://639fdc2445489.streamlock.net:1955/webrtc-session.json";
let wsConnection,
    videoElement = null;

const wsConnect = () => {
    let _this = this;
    let streamInfo = { applicationName, streamName };
    let userData = { iceServers: [] };
    let peerConnection = new RTCPeerConnection(userData);
    let repeaterRetryCount;

    try {
        wsConnection = new WebSocket(wssUrl);
    } catch (e) {
        console.log(e);
    }
    wsConnection.binaryType = "arraybuffer";

    wsConnection.onopen = () => {
        console.log("onopen");

        peerConnection.onicecandidate = _this.gotIceCandidate;

        peerConnection.ontrack = (event) => {
            console.log("gotRemoteTrack: kind:" + event.track.kind + " stream:" + event.streams[0]);
            try {
                videoElement.srcObject = event.streams[0];
            } catch (error) {
                videoElement.src = window.URL.createObjectURL(event.streams[0]);
            }
        };
        sendPlayGetOffer();
    };

    const sendPlayGetOffer = () => {
        console.log("sendPlayGetOffer: " + JSON.stringify(streamInfo));
        wsConnection.send('{"direction":"play", "command":"getOffer", "streamInfo":' + JSON.stringify(streamInfo) + ', "userData":' + JSON.stringify(userData) + "}");
    };

    const stop = () => {
        if (peerConnection != null) {
            peerConnection.close();
        }
        if (wsConnection != null) {
            wsConnection.close();
        }
        peerConnection = null;
        wsConnection = null;
        videoElement.src = "";
    };

    wsConnection.onmessage = function (evt) {
        console.log("wsConnection.onmessage: " + evt.data);

        let msgJSON = JSON.parse(evt.data);
        let msgStatus = Number(msgJSON["status"]);
        let msgCommand = msgJSON["command"];

        if (msgStatus == 514) {
            // repeater stream not ready
            repeaterRetryCount++;
            if (repeaterRetryCount < 10) {
                setTimeout(sendPlayGetOffer, 500);
            } else {
                console.log("Live stream repeater timeout: " + streamName);
                stop();
            }
        } else if (msgStatus != 200) {
            console.log(msgJSON["statusDescription"]);
            stop();
        } else {
            let streamInfoResponse = msgJSON["streamInfo"];
            if (streamInfoResponse !== undefined) {
                streamInfo.sessionId = streamInfoResponse.sessionId;
            }

            let sdpData = msgJSON["sdp"];
            if (sdpData != null) {
                console.log("sdp: " + JSON.stringify(msgJSON["sdp"]));

                if (mungeSDP != null) {
                    msgJSON.sdp.sdp = mungeSDP(msgJSON.sdp.sdp);
                }

                // Enhance here if Safari is a published stream.
                console.log("SDP Data: " + msgJSON.sdp.sdp);

                peerConnection
                    .setRemoteDescription(new RTCSessionDescription(msgJSON.sdp))
                    .then(() =>
                        peerConnection.createAnswer().then((description) => {
                            peerConnection
                                .setLocalDescription(description)
                                .then(() => {
                                    console.log("sendAnswer");
                                    wsConnection.send(
                                        '{"direction":"play", "command":"sendResponse", "streamInfo":' +
                                            JSON.stringify(streamInfo) +
                                            ', "sdp":' +
                                            JSON.stringify(description) +
                                            ', "userData":' +
                                            JSON.stringify(userData) +
                                            "}"
                                    );
                                })
                                .catch((err) => console.log("set local description error", err));
                        })
                    )
                    .catch((err) => console.log("set remote description error", err));
            }

            let iceCandidates = msgJSON["iceCandidates"];
            if (iceCandidates != null) {
                for (let index in iceCandidates) {
                    console.log("iceCandidates: " + JSON.stringify(iceCandidates[index]));
                    peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidates[index]));
                }
            }
        }

        if ("sendResponse".localeCompare(msgCommand) == 0) {
            if (wsConnection != null) {
                wsConnection.close();
            }

            wsConnection = null;
        }
    };

    wsConnection.onclose = function () {
        console.log("wsConnection.onclose");
    };

    wsConnection.onerror = function (evt) {
        console.log(evt);
    };
};

const mungeSDP = (sdpStr) => {
    // For greatest playback compatibility,
    // force H.264 playback to baseline (42e01f).
    let sdpLines = sdpStr.split(/\r\n/);
    let sdpStrRet = "";

    for (var sdpIndex in sdpLines) {
        var sdpLine = sdpLines[sdpIndex];

        if (sdpLine.length == 0) continue;

        if (sdpLine.includes("profile-level-id")) {
            // The profile-level-id string has three parts: XXYYZZ, where
            //   XX: 42 baseline, 4D main, 64 high
            //   YY: constraint
            //   ZZ: level ID
            // Look for codecs higher than baseline and force downward.
            let profileLevelId = sdpLine.substr(sdpLine.indexOf("profile-level-id") + 17, 6);
            let profile = Number("0x" + profileLevelId.substr(0, 2));
            let constraint = Number("0x" + profileLevelId.substr(2, 2));
            let level = Number("0x" + profileLevelId.substr(4, 2));
            if (profile > 0x42) {
                profile = 0x42;
                constraint = 0xe0;
                level = 0x1f;
            }
            let newProfileLevelId =
                ("00" + profile.toString(16)).slice(-2).toLowerCase() + ("00" + constraint.toString(16)).slice(-2).toLowerCase() + ("00" + level.toString(16)).slice(-2).toLowerCase();

            sdpLine = sdpLine.replace(profileLevelId, newProfileLevelId);
        }

        sdpStrRet += sdpLine;
        sdpStrRet += "\r\n";
    }

    return sdpStrRet;
};

/*
            initialize and play, wire in play button here
          */
if (applicationName == "" || streamName == "" || wssUrl == "") {
    alert("Please fill out the connection details");
} else {
    videoElement = document.getElementById("player-video");
    wsConnect();
}
