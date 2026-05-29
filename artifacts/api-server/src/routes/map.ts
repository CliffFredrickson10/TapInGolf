import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Router, type IRouter } from "express";
import { query } from "../lib/pg";

const router: IRouter = Router();

const __dir = dirname(fileURLToPath(import.meta.url));
const LEAFLET_CSS = readFileSync(join(__dir, "../lib/leaflet.css"), "utf8");
const LEAFLET_JS  = readFileSync(join(__dir, "../lib/leaflet.js"),  "utf8");

router.get("/map-embed", async (req, res): Promise<void> => {
  const userLat = req.query.lat ? parseFloat(String(req.query.lat)) : null;
  const userLng = req.query.lng ? parseFloat(String(req.query.lng)) : null;
  const hasUser = userLat !== null && userLng !== null && !isNaN(userLat) && !isNaN(userLng);

  let clubs: any[] = [];
  try {
    clubs = await query<any>(
      `SELECT id, name, location, province, price_from, latitude, longitude
       FROM clubs WHERE latitude IS NOT NULL AND longitude IS NOT NULL`
    );
  } catch {}

  const pinsJson = JSON.stringify(clubs);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <style>${LEAFLET_CSS}</style>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:100%;height:100%;overflow:hidden}
    #map{width:100%;height:100%}
    .cm{background:#1a5c38;border:2.5px solid #fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 10px rgba(0,0,0,.35);cursor:pointer}
    .um{background:#1976d2;border:3px solid #fff;border-radius:50%;width:18px;height:18px;box-shadow:0 0 0 4px rgba(25,118,210,.25)}
    .leaflet-popup-content-wrapper{border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,.18);padding:0}
    .leaflet-popup-content{margin:0}
    .pop{padding:14px 16px;min-width:180px;font-family:-apple-system,sans-serif}
    .pop-name{font-weight:700;font-size:14px;color:#111;margin-bottom:3px}
    .pop-loc{color:#777;font-size:12px;margin-bottom:4px}
    .pop-price{color:#1a5c38;font-weight:700;font-size:13px;margin-bottom:10px}
    .pop-btn{background:#1a5c38;color:#fff;border:none;border-radius:9px;padding:8px 0;font-size:13px;font-weight:600;cursor:pointer;width:100%;display:block}
  </style>
</head>
<body>
<div id="map"></div>
<script>${LEAFLET_JS}</script>
<script>
(function(){
  var clubs=${pinsJson};
  var uLat=${hasUser ? userLat : "null"};
  var uLng=${hasUser ? userLng : "null"};
  var map=L.map('map',{zoomControl:true});
  if(uLat!==null){
    var circ=L.circle([uLat,uLng],{radius:50000,color:'#1976d2',fillColor:'#1976d2',fillOpacity:0.06,weight:1.5,dashArray:'6,4'}).addTo(map);
    map.fitBounds(circ.getBounds(),{padding:[24,24]});
    L.marker([uLat,uLng],{icon:L.divIcon({html:'<div class="um"></div>',className:'',iconSize:[18,18],iconAnchor:[9,9]}),zIndexOffset:1000}).addTo(map).bindPopup('<div style="padding:8px 10px;font-size:13px;font-weight:600">You are here</div>',{closeButton:false});
  }else{map.setView([-28.5,25.5],5);}
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap',maxZoom:18}).addTo(map);
  clubs.forEach(function(c){
    var icon=L.divIcon({html:'<div class="cm">&#9971;</div>',className:'',iconSize:[32,32],iconAnchor:[16,16],popupAnchor:[0,-20]});
    var price=c.price_from?'From R'+Math.round(c.price_from)+' / player':'';
    var pop='<div class="pop"><div class="pop-name">'+c.name+'</div><div class="pop-loc">&#128205; '+c.location+', '+c.province+'</div>'+(price?'<div class="pop-price">'+price+'</div>':'')+'<button class="pop-btn" onclick="tap('+c.id+')">View &amp; Book &#8594;</button></div>';
    L.marker([c.latitude,c.longitude],{icon:icon}).addTo(map).bindPopup(pop,{maxWidth:240,closeButton:false});
  });
  function tap(id){
    var msg=JSON.stringify({type:'club',id:id});
    try{window.ReactNativeWebView.postMessage(msg)}catch(e){}
    try{window.parent.postMessage(msg,'*')}catch(e){}
  }
})();
</script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(html);
});

export default router;
