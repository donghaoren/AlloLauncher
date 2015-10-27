function ServerLog(message) {
    var ts = (new Date().getTime() / 1000).toFixed(3);
    console.log("[" + ts + "]", message);
}

exports.ServerLog = ServerLog;
