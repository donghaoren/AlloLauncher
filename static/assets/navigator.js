var JoystickNavigator = function(container, args) {
    var self = this;

    this.args = args;
    this.container = d3.select(container);
    this.svg = this.container.append("svg").style({
        position: "absolute",
        left: 0, top: 0
    });
    this.controls = this.container.append("div").style({
        position: "absolute"
    });

    this.controls_inner = this.controls.append("div").style({
        padding: "10px",
        "text-align": "center"
    });

    self.lock_lx = false;
    self.lock_ly = false;
    self.lock_rx = false;
    self.lock_ry = false;
    self.use_xy = false;

    var reset_line = this.controls_inner.append("div").style({ height: "50px" });
    this.button_reset = reset_line.append("span").text("RESET").attr("class", "btn");

    var x_line = this.controls_inner.append("div").style({ height: "50px" });
    this.button_lock_lx = x_line.append("span").text("L.X").attr("class", "btn");
    x_line.append("span").text(" ");
    this.button_lock_rx = x_line.append("span").text("L.X").attr("class", "btn");

    var y_line = this.controls_inner.append("div").style({ height: "50px" });
    this.button_lock_ly = y_line.append("span").text("L.Y").attr("class", "btn");
    y_line.append("span").text(" ");
    this.button_lock_ry = y_line.append("span").text("L.Y").attr("class", "btn");

    var xz_line = this.controls_inner.append("div").style({ height: "50px" });
    this.button_xy = xz_line.append("span").text("XY Mode").attr("class", "btn");

    this.button_lock_lx.on("click", function() {
        d3.select(this).classed("active", !d3.select(this).classed("active"));
        self.lock_lx = d3.select(this).classed("active");
    });
    this.button_lock_ly.on("click", function() {
        d3.select(this).classed("active", !d3.select(this).classed("active"));
        self.lock_ly = d3.select(this).classed("active");
    });
    this.button_lock_rx.on("click", function() {
        d3.select(this).classed("active", !d3.select(this).classed("active"));
        self.lock_rx = d3.select(this).classed("active");
    });
    this.button_lock_ry.on("click", function() {
        d3.select(this).classed("active", !d3.select(this).classed("active"));
        self.lock_ry = d3.select(this).classed("active");
    });
    this.button_reset.on("click", function() {
        if(self.onMessage) {
            self.onMessage("reset");
        }
    });
    this.button_xy.on("click", function() {
        d3.select(this).classed("active", !d3.select(this).classed("active"));
        self.use_xy = d3.select(this).classed("active");
    });

    this.update();
};

JoystickNavigator.prototype.resize = function() {
    this.update();
};

JoystickNavigator.prototype.update = function() {
    var self = this;

    var width = this.container.node().getBoundingClientRect().width;
    var height = this.container.node().getBoundingClientRect().height;
    var margin = 30;

    this.svg.attr("width", width);
    this.svg.attr("height", height);

    var size = Math.min(height - margin * 2, (width - margin * 3 - 100) / 2, this.args.max_size);

    this.controls.style({
        left: size + margin * 2 + "px",
        right: size + margin * 2 + "px",
        height: size + "px",
        bottom: margin + "px"
    });

    var rect_l = this.svg.selectAll("circle.rl").data([0]);
    rect_l.enter().append("circle").attr("class", "rl");
    var rect_r = this.svg.selectAll("circle.rr").data([0]);
    rect_r.enter().append("circle").attr("class", "rr");
    var circle_l = this.svg.selectAll("circle.l").data([0]);
    circle_l.enter().append("circle").attr("class", "l");
    var circle_r = this.svg.selectAll("circle.r").data([0]);
    circle_r.enter().append("circle").attr("class", "r");

    var l_x = 0, l_y = 0;
    var r_x = 0, r_y = 0;

    rect_l.attr("cx", margin + size / 2).attr("cy", height - size - margin + size / 2).attr("r", size / 2).style({
        fill: "#222",
        stroke: "none"
    });
    rect_r.attr("cx", width - size - margin + size / 2).attr("cy", height - size - margin + size / 2).attr("r", size / 2).style({
        fill: "#222",
        stroke: "none"
    });

    var radius = size / 6;

    function position_circles() {
        circle_l.attr("cx", margin + size / 2 + l_x * size / 2).attr("cy", height - size - margin + size / 2 + l_y * size / 2).attr("r", radius).style({
            fill: "white",
            cursor: "pointer"
        });
        circle_r.attr("cx", width - size - margin + size / 2 + r_x * size / 2).attr("cy", height - size - margin + size / 2 + r_y * size / 2).attr("r", radius).style({
            fill: "white",
            cursor: "pointer"
        });
    }
    position_circles();

    function raise_event() {
        if(self.onMessage) {
            if(!self.use_xy) {
                self.onMessage(l_x, 0, l_y, r_x, r_y);
            } else {
                self.onMessage(l_x, l_y, 0, r_x, r_y);
            }
        }
    }

    var drag_l = d3.behavior.drag();
    drag_l.origin(function() {
        return { x: l_x * size / 2, y: l_y * size / 2 };
    });
    circle_l.call(drag_l);
    drag_l.on("drag", function() {
        d3.event.sourceEvent.stopPropagation(); // silence other listeners
        var x = d3.event.x;
        var y = d3.event.y;
        l_x = x / size * 2;
        l_y = y / size * 2;
        if(l_x * l_x + l_y * l_y > 1) {
            var l = Math.sqrt(l_x * l_x + l_y * l_y);
            l_x /= l;
            l_y /= l;
        }
        if(self.lock_lx) l_x = 0;
        if(self.lock_ly) l_y = 0;
        position_circles();
        raise_event();
    });
    drag_l.on("dragend", function() {
        l_x = 0; l_y = 0;
        position_circles();
        raise_event();
    });

    var drag_r = d3.behavior.drag();
    drag_r.origin(function() {
        return { x: r_x * size / 2, y: r_y * size / 2 };
    });
    circle_r.call(drag_r);
    drag_r.on("drag", function() {
        d3.event.sourceEvent.stopPropagation(); // silence other listeners
        var x = d3.event.x;
        var y = d3.event.y;
        r_x = x / size * 2;
        r_y = y / size * 2;
        if(r_x * r_x + r_y * r_y > 1) {
            var l = Math.sqrt(r_x * r_x + r_y * r_y);
            r_x /= l;
            r_y /= l;
        }
        if(self.lock_rx) r_x = 0;
        if(self.lock_ry) r_y = 0;
        position_circles();
        raise_event();
    });
    drag_r.on("dragend", function() {
        r_x = 0; r_y = 0;
        position_circles();
        raise_event();
    });
};
