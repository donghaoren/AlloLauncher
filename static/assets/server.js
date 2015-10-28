var socket = io();
var Emit = function(path) {
    socket.emit("m", [ path, Array.prototype.slice.call(arguments, 1) ]);
}
var handlers = { };
socket.on("m", function(msg) {
    var path = msg[0];
    var args = msg[1];
    if(handlers[path]) {
        handlers[path].apply(null, args);
    }
});
socket.on("ms", function(msgs) {
    for(var msg of msgs) {
        var path = msg[0];
        var args = msg[1];
        if(handlers[path]) {
            handlers[path].apply(null, args);
        }
    }
});
var Listen = function(path, handler) {
    handlers[path] = handler;
};

var current_preset = null;

d3.select("#btn-back").on("click", function() {
    $("#preset-detail-container").hide();
    $("#presets-container").show();
});

Listen("presets.list", function(presets) {
    d3.select("#presets").selectAll("a").remove();
    var preset_divs = d3.select("#presets").selectAll("a").data(presets);
    preset_divs.enter().append("a");
    preset_divs.exit().remove();
    preset_divs.attr("href", "#").classed("list-group-item", true);
    preset_divs.append("h4").classed("list-group-item-heading", true).text(function(d) { return d.name; });
    preset_divs.append("p").classed("list-group-item-text", true).text(function(d) { return d.description; });
    preset_divs.on("click", function(d) {
        current_preset = d;
        if(!current_preset.actions) current_preset.actions = [];
        if(!current_preset.commands) current_preset.commands = [];

        $("#preset-detail-container").show();
        $("#presets-container").hide();
        $("#preset-detail-container .preset-name").text(current_preset.name);
        $("#preset-detail-container .preset-details").html(marked(current_preset.markdown));
        var preset_action_divs = d3.select("#preset-detail-container .preset-actions").selectAll("a").data(current_preset.actions);
        preset_action_divs.enter().append("a");
        preset_action_divs.exit().remove();
        preset_action_divs.attr("href", "#").classed("list-group-item", true).classed("disabled", false).text(function(d) {
            return d.name;
        }).on("click", function(d) {
            if(d.confirm) {
                if(!confirm("Do you want to perform this action?")) return;
            }
            if(d.once) {
                d3.select(this).classed("disabled", true).on("click", null);
            }
            d.actions.forEach(function(action) {
                if(action.launcher) {
                    action.launcher.forEach(function(launcher_item) {
                        Emit("launcher.launch", launcher_item.id, launcher_item.host, launcher_item.command);
                    });
                }
            });
        });

        var preset_command_divs = d3.select("#preset-detail-container .preset-commands").selectAll("a").data(current_preset.commands);
        preset_command_divs.enter().append("a");
        preset_command_divs.exit().remove();
        preset_command_divs.attr("href", "#").classed("list-group-item", true).classed("disabled", false).text(function(d) {
            return d.name;
        }).on("click", function(d) {
            if(d.confirm) {
                if(!confirm("Do you want to issue this command?")) return;
            }
            if(d.once) {
                d3.select(this).classed("disabled", true).on("click", null);
            }
            var target_machines = d.target_machines;
            if(typeof(target_machines) == "string") target_machines = [ target_machines ];
            if(d.action == "kill") {
                target_machines.forEach(function(m) {
                    Emit("launcher.kill_by_id", m);
                });
            }
            if(d.command) {
                target_machines.forEach(function(m) {
                    Emit("launcher.send_command_by_id", m, d.command);
                });
            }
        });
    });
});

var launched_processes_infos = [];
function EnsureProcessListItem(uuid, info) {
    var filtered = launched_processes_infos.filter(function(item) { return item.uuid == uuid; });
    if(filtered.length == 0) {
        var item = {
            uuid: uuid,
            info: info,
            recent_log: [],
            render: function() {
                var sel = item.log_list.selectAll("pre").data(item.recent_log);
                sel.enter().append("pre");
                sel.exit().remove();
                sel.style({
                    border: "none",
                    margin: "0px",
                    padding: "1px 5px",
                    "border-radius": "0"
                });
                sel.style("border-left", function(d) {
                    var color = "transparent";
                    if(d[0] == "launched") color = "green";
                    if(d[0] == "error") color = "red";
                    if(d[0] == "stderr") color = "yellow";
                    if(d[0] == "command") color = "green";
                    if(d[0] == "terminated") color = "red";
                    return "4px solid " + color;
                });
                sel.style("background", function(d) {
                    if(d[0] == "command") return "rgba(0, 255, 0, 0.04)";
                    return "none";
                });
                sel.text(function(d) {
                    return d[1];
                });
                $(item.log_list.node()).scrollTop(item.log_list.node().scrollHeight);
            },
            remove: function() {
                item.element.classed("panel-success", false);
                item.element.classed("panel-default", true).style("opacity", 0.5);
            }
        }
        launched_processes_infos.push(item);
        item.element = d3.select("#launched-processes-container").insert("div", ":first-child");
        item.element.classed("panel panel-success", true);
        var heading = item.element.append("div").classed("panel-heading clearfix", true).style("line-height", "30px").style("font-size", "18px");
        heading.append("b").text(info.host);
        heading.append("span").text(": ");
        heading.append("b").text("ID = " + info.id);
        heading.append("span").text(" ");
        heading.append("span").text(info.command);
        var heading_buttons = heading.append("span").style("float", "right");
        heading_buttons.append("span").classed("btn btn-sm btn-danger", true).text("Kill").on("click", function() {
            Emit("launcher.kill_by_uuid", uuid);
        });
        heading_buttons.append("span").text(" ");
        heading_buttons.append("span").classed("btn btn-sm btn-danger", true).text("Kill Same ID").on("click", function() {
            Emit("launcher.kill_by_id", info.id);
        });

        var body = item.element.append("div").classed("panel-body", true);
        item.log_list = body.append("div").classed("well", true).style({
            "max-height": "300px",
            "overflow": "scroll"
        });
        return item;
    } else {
        return filtered[0];
    }
}

var scheduled_renders = new Set();
var scheduled_render_timer = null;
function ScheduleRender_Perform() {
    for(var item of scheduled_renders) {
        item.render();
    }
    scheduled_renders.clear();
    scheduled_render_timer = null;
};
function ScheduleRender(item) {
    scheduled_renders.add(item);
    if(!scheduled_render_timer) {
        scheduled_render_timer = setTimeout(ScheduleRender_Perform, 10);
    }
};

Listen("launcher.log", function(uuid, info, type, line) {
    var item = EnsureProcessListItem(uuid, info);
    item.recent_log.push([type, line]);
    if(item.recent_log.length - 20 > 0) {
        item.recent_log.splice(0, item.recent_log.length - 20);
    }
    ScheduleRender(item);
    if(type == "terminated") {
        item.remove();
    }
});

Listen("launcher.list", function(processes) {
    processes.forEach(function(process) {
        var item = EnsureProcessListItem(process.uuid, process.info);
        item.recent_log = process.recent_log;
        item.render();
    });
});


// Monitor connection status.

function SetConnectionStatus(text, color) {
    $("#connection-status").text(text).css("color", color);
}

socket.on("connect", function() {
    SetConnectionStatus("Connected.", "#0F0");
    Emit("presets.scan");
    Emit("launcher.scan");
});
socket.on("connect_error", function() {
    SetConnectionStatus("Connection error.", "#F00");
});
socket.on("reconnect", function() {
    SetConnectionStatus("Reconnected.", "#FF0");
});
socket.on("connect_timeout", function() {
    SetConnectionStatus("Connection timeout.");
});
socket.on("reconnect_attempt", function() {
    SetConnectionStatus("Attempting to reconnect...", "#FF0");
});
socket.on("reconnecting", function() {
    SetConnectionStatus("Attempting to reconnect...", "#FF0");
});
socket.on("reconnect_error", function() {
    SetConnectionStatus("Reconnect error.", "#F00");
});
socket.on("reconnect_failed", function() {
    SetConnectionStatus("Reconnect failed, gave up.", "#F00");
});
