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
    UpdateLaunchedList();
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
        UpdateLaunchedList();
        current_preset = d;
        if(!current_preset.actions) current_preset.actions = [];
        if(!current_preset.commands) current_preset.commands = [];

        $("#preset-detail-container").show();
        $("#presets-container").hide();
        $("#preset-detail-container .preset-name").text(current_preset.name);
        var processed_markdown = current_preset.markdown;
        processed_markdown = processed_markdown.replace(/@\{command:([^\|]+)\|([^\}]+)\}/ig, function(all, cmd, text) {
            return '<button class="btn btn-sm btn-default" data-command="' + cmd + '">' + text + '</button>';
        });
        processed_markdown = processed_markdown.replace(/@\{action:([^\|]+)\|([^\}]+)\}/ig, function(all, cmd, text) {
            return '<button class="btn btn-sm btn-primary" data-action="' + cmd + '">' + text + '</button>';
        });
        $("#preset-detail-container .preset-details").html(marked(processed_markdown));
        $("#preset-detail-container .preset-details button").css("margin-top", "2px");
        $("#preset-detail-container .preset-details [data-command]").each(function() {
            var cmd = $(this).attr("data-command");
            $(this).click(function() {
                sendCommand(cmd);
            });
        });
        $("#preset-detail-container .preset-details [data-action]").each(function() {
            var act = $(this).attr("data-action");
            $(this).click(function() {
                sendAction(act);
            });
        });
        var preset_action_divs = d3.select("#preset-detail-container .preset-actions").selectAll("a").data(current_preset.actions);
        preset_action_divs.enter().append("a");
        preset_action_divs.exit().remove();
        preset_action_divs.attr("href", "#").classed("list-group-item", true).classed("disabled", false).text(function(d) {
            return d.name;
        }).on("click", function(d) {
            if(d.confirm) {
                if(!confirm("Do you want to perform this action?")) return;
            }
            sendAction(d.name);
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
            sendCommand(d.name);
        });

        var sendAction = function(name) {
            var filtered = current_preset.actions.filter(function(d) {
                return d.name == name;
            });
            var d;
            if(filtered.length == 1) d = filtered[0];
            else return;
            d.actions.forEach(function(action) {
                if(action.launcher) {
                    action.launcher.forEach(function(launcher_item) {
                        Emit("launcher.launch", launcher_item.id, launcher_item.host, launcher_item.command);
                    });
                }
            });
        };
        var sendCommand = function(name) {
            var filtered = current_preset.commands.filter(function(d) {
                return d.name == name;
            });
            var d;
            if(filtered.length == 1) d = filtered[0];
            else return;
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
            if(d.commands) {
                d.commands.forEach(function(command) {
                    target_machines.forEach(function(m) {
                        Emit("launcher.send_command_by_id", m, command);
                    });
                });
            }
        };

        var dropdown_targets_lis = d3.select("#dropdown-targets").selectAll("li").data(current_preset.target_machines);
        dropdown_targets_lis.enter().append("li").append("a");
        dropdown_targets_lis.exit().remove();
        d3.select("#btn-send-command").on("click", null);
        d3.select("#dropdown-targets-selected").text("Select...").attr("data-target-machine", "");
        dropdown_targets_lis.select("a").text(function(d) { return d.name; }).on("click", function(d) {
            d3.select("#dropdown-targets-selected").text(d.name).attr("data-target-machine", d.id);
            d3.select("#btn-send-command").on("click", function() {
                var id = d.id;
                var command = d3.select("#text-send-command").property("value");
                Emit("launcher.send_command_by_id", id, command);
            });
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
                    "border-radius": "0",
                    "font-size": "10px"
                });
                var border_left_style = function(d) {
                    var color = "transparent";
                    if(d[0] == "launched") color = "green";
                    if(d[0] == "error") color = "red";
                    if(d[0] == "stderr") color = "yellow";
                    if(d[0] == "command") color = "green";
                    if(d[0] == "terminated") color = "red";
                    return "4px solid " + color;
                };
                sel.style("border-left", border_left_style);
                sel.style("background", function(d) {
                    if(d[0] == "command") return "rgba(0, 255, 0, 0.04)";
                    return "none";
                });
                sel.text(function(d) {
                    return d[1];
                });
                if(item.recent_log.length > 0) {
                    var lastlog = item.recent_log[item.recent_log.length - 1];
                    span_lastlog.text(lastlog[1]);
                }
                $(item.log_list.node()).scrollTop(item.log_list.node().scrollHeight);
            },
            remove: function() {
                item.element.classed("panel-success", false);
                item.element.classed("panel-default", true).style("opacity", 0.5);
                $(body.node()).slideUp();
            }
        }
        launched_processes_infos.push(item);
        item.element = d3.select("#launched-processes-container").insert("div", ":first-child");
        item.element.style("margin-bottom", "5px");
        item.element.classed("panel panel-success", true);
        var heading = item.element.append("div").classed("panel-heading clearfix", true)
            .style("line-height", "20px")
            .style("padding", "5px 10px")
            .style("font-size", "14px");
        heading.append("b").text(info.host);
        heading.append("span").text(": ");
        heading.append("b").text(info.id);
        var span_lastlog = heading.append("span").text("").style({
            "margin-left": "5px",
            "font-size": "12px"
        });
        var heading_buttons = heading.append("span").style("float", "right");
        heading.on("click", function() {
            $(body.node()).slideToggle();
        });
        heading_buttons.append("span").classed("btn btn-xs btn-danger", true).text("Kill This").on("click", function() {
            Emit("launcher.kill_by_uuid", uuid);
            d3.event.stopPropagation();
        });
        heading_buttons.append("span").text(" ");
        heading_buttons.append("span").classed("btn btn-xs btn-danger", true).text("Kill Same ID").on("click", function() {
            Emit("launcher.kill_by_id", info.id);
            d3.event.stopPropagation();
        });

        var body = item.element.append("div").classed("panel-body", true).style("padding", "0px").style("display", "none");
        item.log_list = body.append("div").classed("", true).style({
            "max-height": "150px",
            "padding": "5px",
            "margin": "0",
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
        scheduled_render_timer = setTimeout(ScheduleRender_Perform, 100);
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
    launched_processes_infos = [];
    scheduled_renders = new Set();
    d3.select("#launched-processes-container").selectAll("div").remove();
    processes.forEach(function(process) {
        var item = EnsureProcessListItem(process.uuid, process.info);
        item.recent_log = process.recent_log;
        item.render();
    });
});

function UpdateLaunchedList() {
    Emit("launcher.scan");
}

// Monitor connection status.

function SetConnectionStatus(text, color) {
    $("#connection-status").text(text).css("color", color);
}

socket.on("connect", function() {
    SetConnectionStatus("Connected.", "#0F0");
    Emit("presets.scan");
    UpdateLaunchedList();
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
