const env= require("./_env.js");
const wifi = require('Wifi');
var f = new (require("FlashEEPROM"))();
import L from "./led.js";
//IO for Sonoff Itead
// 13 : led
// 0 : Button
// 12 : Relay
L.init(13);

const C={
  handleRequest: (req,res)=>{
    console.log("connected...");
    print(process.memory());
    if (req.method=="POST") {
      obj=C.parse(req.read())
      console.log("start wifi...", obj)
      res.writeHead(200);
      res.end(`<html><h2>You can now close this page and restore your Wi-Fi connection.</h2></html>`);
      setTimeout(() => {
        wifi.stopAP();
        C.start_wifi_and_register(obj.s, obj.p, obj.c);
        L.turn(false);
      }, 3000)
    }else{
      wifi.scan(ns => {
        let out=`<html><style>body *{font-size:24px;padding:8px;display:block;}</style><meta name="viewport" content="width=device-width, initial-scale=1"><form method="POST" action="/"><label for="s">Choose Wifi</label><br/><select name="s" id="s">`
        out=out+ns.map(n => '<option value="'+n.ssid+'">'+n.ssid+'</option>');
        out=out+`</select><label>Password</label><input id="p" name="p" type="text"/><label for="c">Node Code</label><input id="c" name="c" type="text" /><input type="submit" value="save"></form>`;
        console.log("connected...");
        print(process.memory());
        out=out+"</html>"
        res.writeHead(200);
        res.end(out);
      });
    }
  },
  parse:(s)=>{
    return s.split("&").reduce((prev, c)=> {
      let p = c.split("=");
      prev[decodeURIComponent(p[0])] = decodeURIComponent(p[1]);
      return prev;
    }, {});
  },
  onWifiError:()=>{
    console.log("ERROR wifi")
    C.reboot=false;
    print(process.memory());
    wifi.setHostname("aurora")
    wifi.startAP("aurora", {}, err => {
      require("http").createServer(C.handleRequest).listen(80);
      L.turn(true)
      console.log("Visit http://" + wifi.getIP().ip, "in your web browser.");
      print(process.memory());
    })
  },
  check_wifi:()=>{
    var ct=setInterval(()=>{
      wifi.getDetails(obj =>{
        console.log(obj.status)
        if(obj.status=="no_ap_found" || obj.status=="wrong_password" || obj.status=="off" || obj.status=="connect_failed"){
          C.error()
          clearInterval(ct);
        }
        if(obj.status=="connected"){
          clearInterval(ct);
        }
      })
    },1000)
  },

  error:()=>{
    console.log("ERROR")
    C.reboot=true;
    print(process.memory());
    L.blink(5, 1000);
    setTimeout(()=>{
      print(process.memory());
      if(C.reboot){load()};
    }, 10000)
  },
  start_wifi_and_register:(ssid, password, code)=>{
    C.check_wifi()
    wifi.connect(ssid, { password: password }, (error) => {
      if(error){
        C.error()
      }else{
        console.log(`Connected to: ${ wifi.getIP().ip }`)
        f.write(0, ssid);
        f.write(1, password);
        f.write(2, code);
        C.register_node(code)
      }
      L.blink(5)
    });
  },
  read:(pos)=>{
    let p=f.read(pos);
    return (p!=undefined ? E.toString(p) : undefined)
  },
  init:(cb)=>{
    C.check_wifi()
    let ssid=C.read(0)
    let pass=C.read(1)
    console.log("saved ssid:", ssid)
    console.log("saved pass:", pass)
    if(ssid!=undefined){
      wifi.connect(ssid, { password: pass }, (e) => {
        if (e){
          C.error()
        }else{
          let token=C.read(3)
          if(token){
            console.log("after")
            print(process.memory());
            cb(token)
          }else{
            C.register_node(C.read(2))
          }
        }
     });
     wifi.on("disconnected", C.error);
    }
  }
}
pinMode(0, 'input_pullup');
const onClickBtn = event => {
  console.log(`button pushed: ${ JSON.stringify(event) }`);
  print(process.memory());
  Modules.removeCached('MQTT')
  print(process.memory());
  C.onWifiError();
}

const main = ()=>{
  setWatch(onClickBtn, 0, { repeat: true, edge: 'falling', debounce: 50 });
  print(process.memory());
  C.init( topic =>{
    print(process.memory());
    console.log("CONNECTED", topic);
    let mqtt = require("MQTT").create(env[1], {options:{port:env[2]}});
    mqtt.on('connected', () => {
      mqtt.subscribe(topic+"/update");
      console.log('Connected', topic+"/update");
      L.blink(2,3000)
    });
    mqtt.on("message", (to, m) => {
      console.log("message", JSON.parse(m));
      digitalWrite(12, JSON.parse(m).open)
      digitalWrite(13, !JSON.parse(m).open)
      L.turn(JSON.parse(m).open)
    })
    mqtt.on("close", C.error)
    mqtt.connect()
    print(process.memory());
  })
}
