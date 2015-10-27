var ServerLog = require("./log.js").ServerLog;

function HTTPServer(config) {
    var self = this;
    this.handlers = { };

    var express = require("express");
    var app = express();
    var http = require('http').Server(app);
    var io = require('socket.io')(http);

    app.use(express.static(config.http.static));

    if(config.http.port) {
        http.listen(config.http.port, config.http.hostname, function() {
            ServerLog("HTTPServer: Listening on " + (config.http.hostname ? config.http.hostname : "<any>") + ":" + config.http.port);
        });
    } else if(config.http.socket) {
        http.listen(config.http.socket, function() {
            ServerLog("HTTPServer: Listening on unix socket: " + config.http.socket);
        });
    }

    this.sockets = new Set();

    io.on('connection', function(socket) {
        ServerLog("New connection: " + socket.id);
        self.sockets.add(socket);

        socket.on('disconnect', function() {
            ServerLog("Connection closed: " + socket.id);
            self.sockets.delete(socket);
        });

        socket.on('m', function(msg) {
            try {
                if(self.handlers[msg[0]]) {
                    self.handlers[msg[0]].apply(null, msg[1]);
                }
            } catch(e) {
                ServerLog(e.stack);
            }
        });
    });
}
HTTPServer.prototype.broadcast = function(path) {
    for(var item of this.sockets) {
        item.emit("m", [ path, Array.prototype.slice.call(arguments, 1) ]);
    }
};
HTTPServer.prototype.on = function(event, handler) {
    this.handlers[event] = handler;
};

exports.HTTPServer = HTTPServer;
