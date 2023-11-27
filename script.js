var display_log_level = "debug"
var lerpscale = 1
var graphpoint = 4096
var graphprecision = 32
var Render_Delta = new Date().getMilliseconds()
var latency = 0
var External_Delay = 0
var rate = 0
var graph_array = []
var color = [125/255, 100/255, 75/255]
var disable_interpolation = true
try{
    window.wallpaperPropertyListener = {
        applyUserProperties: function(properties) {
            if (properties.barcolor) {
                color= properties.barcolor.value.split(' ');
            }
            if (properties.disable_interpolation) {
                disable_interpolation = properties.disable_interpolation.value;
            }
            if (properties.lerpscale) {
                lerpscale = parseFloat(properties.lerpscale.value);
            }
            if (properties.loglevel) {
                display_log_level = parseFloat(properties.loglevel.value);
            }
            if (properties.graphprecision) {
                graphprecision = parseFloat(properties.graphprecision.value);
            }
            if (properties.graphpoint) {
                graphpoint = parseFloat(properties.graphpoint.value);
                if (graph_array.length > graphpoint){
                    for (let _round=0;_round < (graph_array.length - graphpoint);_round++){
                        graph_array.shift(0)
                    }
                }else if (graph_array.length < graphpoint){
                    for (let _round=0;_round < (graphpoint - graph_array.length);_round++){
                        graph_array.push(0)
                    }
                }
            }
        },
    };
}catch(e){
    console.error(e)
}

let audio_array_data = []
// Get the audio canvas once the page has loaded
let audioCanvas = document.getElementById('AudioCanvas');
var ConsoleCanvas = document.getElementById('ConsoleOutput');
var statisticsCanvas = document.getElementById("Statistics")
// Get the 2D context of the canvas to draw on it in wallpaperAudioListener
let gl = audioCanvas.getContext('webgl',{antialias: true});
var ConsoleCanvasCtx = ConsoleCanvas.getContext('2d');
var statisticsCanvasCtx = statisticsCanvas.getContext('2d');
// Setting internal canvas resolution to user screen resolution
// (CSS canvas size differs from internal canvas size)
audioCanvas.height = window.innerHeight;
audioCanvas.width = window.innerWidth;
ConsoleCanvas.height = audioCanvas.height
ConsoleCanvas.width = audioCanvas.width
statisticsCanvas.height = audioCanvas.height
statisticsCanvas.width = audioCanvas.width     
statisticsCanvasCtx.font = "20px serif";
var vid = document.querySelector("body > video")
if (vid){
	vid.play().then(()=>{console.log("Played")}).catch((e)=>{console.error(e)})
}
//console hook
if (console.everything === undefined) {
    console.original_log = console.log;
    console.everything = [];
    function TS(){
        return (new Date).toLocaleString("sv") + "Z"
    }
    window.onerror = function (error, url, line) {
        console.everything.push({
            type: "exception",
            timeStamp: TS(),
            value: { error, url, line }
        })
        if(console.everything.length > 10){
            console.everything.shift(0)
        }
        return false;
    }
    window.onunhandledrejection = function (e) {
        console.everything.push({
            type: "promiseRejection",
            timeStamp: TS(),
            value: e.reason
        })
        if(console.everything.length > 10){
            console.everything.shift(0)
        }
    } 
    function hookLogType(logType) {
        const original= console[logType].bind(console)
        return function(){
            console.everything.push({ 
                type: logType, 
                timeStamp: TS(), 
                value: Array.from(arguments) 
            })
            if(console.everything.length > 10){
                console.everything.shift(0)
            }
            original.apply(console, arguments)
        }
    }
    ['log', 'error', 'warn', 'debug'].forEach(logType=>{
        console[logType] = hookLogType(logType)
    })
}
var textsize =  18
ConsoleCanvasCtx.font = textsize+"px serif";
function console_draw(){
    ConsoleCanvasCtx.clearRect(0, 0, ConsoleCanvas.width, ConsoleCanvas.height);
    let y = 60
    function draw(log_info){
        /*if(log_info.type == "exception"){
            ConsoleCanvasCtx.fillText("["+log_info["timeStamp"]+"]["+log_info["type"] +":"+ log_info["value"].line + "]" + log_info["value"].error, 600,y); 
        }else{
            ConsoleCanvasCtx.fillText("["+log_info["timeStamp"]+"]["+log_info["type"] + "]" + log_info["value"], 600,y); 
        }*/
	if (log_info.type == "log"){
	    ConsoleCanvasCtx.fillText("["+log_info["timeStamp"]+"]["+log_info["type"] + "]" + log_info["value"], 600,y); 
	}
        y+=textsize
    }
    let current_log = null
    let type_lookup = {
        "log"              : 1,
        "warn"             : 2,
        "error"            : 3,
        "exception"        : 3,
        "promiseRejection" : 3,
        "debug"            : 4
    }
    for(let log_index = 0;log_index < console.everything.length; log_index++){
        current_log = console.everything[log_index]
        if (current_log){
            if (current_log.type){
                if (type_lookup[current_log.type] <= display_log_level){
                    draw(current_log)
                }else{
                    console.original_log(type_lookup[current_log.type], "<=", display_log_level)
                }
            }
        }
    }
}
setInterval(console_draw,1000)
var OPENGL = true;
if (gl === null) {
    console.log(
        "Unable to initialize WebGL. Your webview or machine may not support it."
    );
}else{
    var datahandler = (d) => {
        income_data = JSON.parse(d)
        if (!disable_interpolation){
            for (let index_push = 0 ; index_push < audio_array_data.length; index_push++){
                graph_array.shift(0)
                graph_array.push(interpolate_audio_data(audio_array_data[index_push],income_data["data"][index_push],lerpscale))
            }
            UpdateLoopDrawGraphOPENGL()
        }
        audio_array_data =  income_data["data"]
        latency = parseInt((new Date().getTime() - income_data["tick"])*1000)/1000
        if(income_data["DelayBetweenRound"]){
            External_Delay = parseFloat(income_data["DelayBetweenRound"])
        }
        for (let index_push = 0 ; index_push < audio_array_data.length; index_push++){
            graph_array.shift(0)
            graph_array.push(audio_array_data[index_push])
        }
        UpdateLoopDrawGraphOPENGL()
    }
    function setup_websocket(url,handler){
        var wsurl = url
        try{
            websocket = new WebSocket("ws://127.0.0.1:13254")
            websocket.onclose = (ev) =>{
                if (!ev.wasClean){
                    //console.log("[WEBSOCKET] Try to re-connect After 1 sec")
                    setTimeout(setup_websocket,1000,"ws://127.0.0.1:13254",handler)
                }else{
                    //console.log("[WEBSOCKET] Try to re-connect After 5 sec")
                    setTimeout(setup_websocket,5000,"ws://127.0.0.1:13254",handler)
                }
                buildin_audio_data = true
            }
            websocket.onmessage = (ev)=>{
                buildin_audio_data = false
                datahandler(ev.data)
            }
            setTimeout(()=>{
                //console.log("Send Data");
                websocket.send(JSON.stringify({"Max_Height":audioCanvas.height, "Skip":graphprecision}))
            }, 5000)
        } catch(e){
            //console.error("Error Throwed: " + e);
            buildin_audio_data = true
            //setTimeout(setup_websocket,1000,"ws://127.0.0.1:13254",handler)
        }
    }
    var websocket = null;
    setup_websocket("ws://127.0.0.1:13254")
    function max(n,max_n){
        if(n <= max_n){
            return n
        }
        return max_n
    }
    function interpolate_audio_data(v0, v1,  t){
        return v0 + t * (v1 - v0);
    }
    function UpdateLoopDrawGraphOPENGL(){
        if (graph_array.length != graphpoint){
            if (graph_array.length > graphpoint){
                for (let _round=0;_round < (graph_array.length - graphpoint);_round++){
                    graph_array.shift(0)
                }
            }else if (graph_array.length < graphpoint){
                for (let _round=0;_round < (graphpoint - graph_array.length);_round++){
                    graph_array.push(0)
                }
            }
        }
        var barWidth = ((gl.drawingBufferWidth)/graphpoint)
        var vertices = [];
        var first_point = -1
        var last_pos_x = first_point
        var last_pos_y = 0
        for (let i = 0; i < graph_array.length; i++) {
            // WebGL Use Scale Coord 0 = center of screen
            let x = (((i+1) *barWidth)/(gl.drawingBufferWidth/2))+first_point
            let y = (graph_array[i]/gl.drawingBufferHeight)
            vertices.push(parseFloat(last_pos_x), parseFloat(last_pos_y), 0.0)
            vertices.push(parseFloat(x), parseFloat(y), 0.0);
            last_pos_x = x
            last_pos_y = y
        }
	    var vertex_buffer = gl.createBuffer( );
	    gl.bindBuffer( gl.ARRAY_BUFFER, vertex_buffer );
	    gl.bufferData( gl.ARRAY_BUFFER, new Float32Array( vertices ), gl.STATIC_DRAW );
	    gl.bindBuffer( gl.ARRAY_BUFFER, null );
	    var vertCode = 
	    'attribute vec3 coordinates;' +
	    'void main(void)' +
	    '{' +
	        ' gl_Position = vec4(coordinates, 1.0);' +
	    '}';
	    var vertShader = gl.createShader( gl.VERTEX_SHADER );
	    gl.shaderSource( vertShader, vertCode );
	    gl.compileShader( vertShader );
	    var fragCode = 
	    'void main(void)' +
	    '{' +
	        ' gl_FragColor = vec4('+color.join(", ")+', 1);' +
	    '}';
	    var fragShader = gl.createShader( gl.FRAGMENT_SHADER );
	    gl.shaderSource( fragShader, fragCode );
	    gl.compileShader( fragShader );
	    var shaderProgram = gl.createProgram( );
	    gl.attachShader( shaderProgram, vertShader );
	    gl.attachShader( shaderProgram, fragShader );
	    gl.linkProgram( shaderProgram );
	    gl.useProgram( shaderProgram );
	    gl.bindBuffer( gl.ARRAY_BUFFER, vertex_buffer );
	    var coord = gl.getAttribLocation( shaderProgram, "coordinates" );
	    gl.vertexAttribPointer( coord, 3, gl.FLOAT, false, 0, 0 );
	    gl.enableVertexAttribArray( coord );
	    gl.clearColor( 0.0, 0.0, 0.0, 0.0 );
	    gl.enable( gl.DEPTH_TEST );
	    gl.clear( gl.COLOR_BUFFER_BIT );
	    gl.viewport( 0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight );
	    gl.drawArrays( gl.LINES, 0, graph_array.length*3 );
        let err_code = gl.getError()
        if (err_code != gl.NO_ERROR){
            switch(err_code){
                case gl.INVALID_ENUM:
                    console.error("[WEBGL ERROR] INVALID_ENUM")
                    break
                case gl.INVALID_VALUE:
                    console.error("[WEBGL ERROR] INVALID_VALUE")
                    break
                case gl.INVALID_OPERATION:
                    console.error("[WEBGL ERROR] INVALID_OPERATION")
                    break
                case gl.INVALID_FRAMEBUFFER_OPERATION:
                    console.error("[WEBGL ERROR] INVALID_FRAMEBUFFER_OPERATION")
                    break
                case gl.OUT_OF_MEMORY:
                    console.error("[WEBGL ERROR] OUT_OF_MEMORY")
                    break
                case gl.CONTEXT_LOST_WEBGL:
                    console.error("[WEBGL ERROR] CONTEXT_LOST_WEBGL")
                    break
            }
        }
        let current_ms = new Date().getMilliseconds()
        rate = parseInt(((current_ms - Render_Delta))*1000)/1000
        Render_Delta = current_ms
    }
    function statistics_update(){
        statisticsCanvasCtx.clearRect(49, 60, ConsoleCanvas.width, ConsoleCanvas.height);
        statisticsCanvasCtx.font = "20px serif";
        statisticsCanvasCtx.fillText("External Audio Data latency: " + latency + "ms", 50,140);
        statisticsCanvasCtx.fillText("External Audio Data Last Fetch: " + parseInt(1/External_Delay * 100) / 100 + "ms", 50,160);
        statisticsCanvasCtx.fillText("Delay between round: " +  rate + "ms", 50,180);
    }
    if (graph_array.length < graphpoint){
        for (let _round=0;_round < (graphpoint - graph_array.length);_round++){
            graph_array.push(0)
        }
    }
    let gen = ()=>{
        try{
            websocket.send(JSON.stringify({"Max_Height":audioCanvas.height, "Skip":graphprecision}))
        }catch(e){
            console.error("Error Throwed: " + e);
        }
    }
    setInterval(gen,(1/60)*1000)
    setInterval(statistics_update,1000)
}
