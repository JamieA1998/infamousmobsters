
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const app = express();
const db = new Database("mobsters.db");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || "change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax" }
}));

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  money INTEGER DEFAULT 5000,
  points INTEGER DEFAULT 0,
  bullets INTEGER DEFAULT 0,
  health INTEGER DEFAULT 100,
  rank TEXT DEFAULT 'Newbie'
);
`);

for (const column of ["last_crime", "last_gta", "cars"]) {
  try {
    db.exec(`ALTER TABLE players ADD COLUMN ${column} INTEGER DEFAULT 0`);
  } catch (e) {}
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;",
  '"': "&quot;", "'": "&#39;"
}[c]));

const page = (title, body) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - InfamousMobsters</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#101820;color:#d7e0e8;font:14px Arial}
header{background:#172b3b;padding:15px;border-bottom:2px solid #34516a}
header h1{margin:0;color:#d9b56d;font-size:23px}
header p{margin:5px 0 0;color:#9aabb9}
a{color:#d9b56d;text-decoration:none}
a:hover{text-decoration:underline}
.layout{display:grid;grid-template-columns:180px minmax(0,1fr) 190px;gap:10px;padding:10px;max-width:1250px;margin:auto}
.panel{background:#192733;border:1px solid #344959;margin-bottom:10px}
.panel h3{margin:0;padding:9px;background:#263b4b;color:#e0bd79;font-size:14px}
.panel-content{padding:10px}
nav a{display:block;padding:8px;border-bottom:1px solid #2a3b48}
main{min-width:0}
button{padding:10px;margin:5px 0;background:#806238;border:0;color:white;width:100%;cursor:pointer;font-weight:bold}
button:hover{background:#a17c49}
.stat{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #2a3b48;gap:5px}
.notice{padding:10px;background:#263b4b;margin:8px 0}
.action{background:#202f3b;border:1px solid #3a5060;padding:12px;margin:10px 0}
.action h4{margin:0 0 8px;color:#e0bd79}
.message{padding:10px;background:#263b4b;border-left:3px solid #d9b56d;margin:10px 0}
@media(max-width:700px){.layout{grid-template-columns:1fr}.layout aside:first-child{order:1}main{order:0}.layout aside:last-child{order:2}}
</style>
</head>
<body>
<header><h1>INFAMOUSMOBSTERS</h1><p>Build your name. Rule the streets.</p></header>
${body}
</body></html>`;

function requireLogin(req,res,next) {
  if (!req.session.player) return res.redirect("/login");
  next();
}

function getPlayer(req) {
  return db.prepare("SELECT * FROM players WHERE id=?").get(req.session.player);
}

app.get("/",(req,res)=>{
  res.redirect(req.session.player ? "/game" : "/login");
});

app.get("/register",(req,res)=>res.send(page("Register",`
<div class="layout"><main><section class="panel">
<h3>Create your account</h3><div class="panel-content">
<form method="post">
<input name="username" placeholder="Choose a username" required minlength="3" maxlength="20">
<input name="password" type="password" placeholder="Choose a password" required minlength="8">
<button>Create account</button></form>
<p>Already registered? <a href="/login">Log in</a></p>
</div></section></main></div>`)));

app.post("/register",async(req,res)=>{
  const username=String(req.body.username||"").trim();
  const password=String(req.body.password||"");
  if(!/^[a-zA-Z0-9_]{3,20}$/.test(username)||password.length<8)
    return res.status(400).send("Use a 3–20 character username and a password of at least 8 characters. <a href='/register'>Try again</a>");
  try {
    const hash=await bcrypt.hash(password,10);
    const result=db.prepare("INSERT INTO players(username,password) VALUES(?,?)").run(username,hash);
    req.session.player=result.lastInsertRowid;
    res.redirect("/game");
  } catch(e) {
    res.status(400).send("That username may already be taken. <a href='/register'>Try again</a>");
  }
});

app.get("/login",(req,res)=>res.send(page("Login",`
<div class="layout"><main><section class="panel">
<h3>Player Login</h3><div class="panel-content">
<form method="post">
<input name="username" placeholder="Username" required>
<input name="password" type="password" placeholder="Password" required>
<button>Log in</button></form>
<p>New here? <a href="/register">Create an account</a></p>
</div></section></main></div>`)));

app.post("/login",async(req,res)=>{
  const player=db.prepare("SELECT * FROM players WHERE username=?").get(String(req.body.username||"").trim());
  if(!player||!await bcrypt.compare(String(req.body.password||""),player.password))
    return res.status(401).send("Incorrect username or password. <a href='/login'>Try again</a>");
  req.session.player=player.id;
  res.redirect("/game");
});

const crimes = {
  "Street Robbery": { min: 100, max: 250 },
  "Shop Robbery": { min: 250, max: 500 },
  "Warehouse Robbery": { min: 500, max: 900 }
};

app.post("/crime",requireLogin,(req,res)=>{
  const name=String(req.body.crime||"");
  const crime=crimes[name];
  if(!crime) return res.redirect("/game?section=Crimes&msg=Invalid%20crime");

  const p=getPlayer(req);
  const now=Math.floor(Date.now()/1000);
  const wait=15-(now-(p.last_crime||0));

  if(wait>0)
    return res.redirect("/game?section=Crimes&msg="+encodeURIComponent("Please wait "+wait+" seconds before committing another crime."));

  const reward=Math.floor(Math.random()*(crime.max-crime.min+1))+crime.min;

  db.prepare("UPDATE players SET money=money+?,last_crime=? WHERE id=?")
    .run(reward,now,p.id);

  res.redirect("/game?section=Crimes&msg="+encodeURIComponent("Success! You completed "+name+" and earned £"+reward.toLocaleString("en-GB")+"."));
});

app.post("/gta",requireLogin,(req,res)=>{
  const action=String(req.body.action||"");
  if(!["Steal a Car","Steal"].includes(action))
    return res.redirect("/game?section=GTA&msg=Invalid%20action");

  const p=getPlayer(req);
  const now=Math.floor(Date.now()/1000);
  const wait=30-(now-(p.last_gta||0));

  if(wait>0)
    return res.redirect("/game?section=GTA&msg="+encodeURIComponent("Please wait "+wait+" seconds before trying again."));

  if(action==="Steal a Car") {
    db.prepare("UPDATE players SET cars=cars+1,last_gta=? WHERE id=?").run(now,p.id);
    return res.redirect("/game?section=GTA&msg="+encodeURIComponent("Success! You stole a car. Your car collection has increased."));
  }

  const reward=Math.floor(Math.random()*201)+100;
  db.prepare("UPDATE players SET money=money+?,last_gta=? WHERE id=?").run(reward,now,p.id);

  res.redirect("/game?section=GTA&msg="+encodeURIComponent("Success! You stole £"+reward.toLocaleString("en-GB")+"."));
});

app.get("/game",requireLogin,(req,res)=>{
  const p=getPlayer(req);
  const links=["Game News","Get Help","Players Online","Top 10","Game Stats","Global Owners","Profile","My Stats","My Perks","My Items","Notifications","Points","Buy Points","Crimes","GTA","Jail","Organised Crime","Missions","Bank","Bullets","Lottery","Hospital","Airport","Heist","Attempts","Kill"];

  const nav=links.map(x=>`<a href="/game?section=${encodeURIComponent(x)}">${x}</a>`).join("");
  const section=String(req.query.section||"Game News");
  const msg=req.query.msg ? `<div class="message">${escapeHtml(req.query.msg)}</div>` : "";

  let content="";

  if(section==="Crimes") {
    content=`<h3>Crimes</h3><div class="panel-content">
    ${msg}<p>Choose a crime to attempt.</p>
    ${Object.keys(crimes).map(name=>`<div class="action">
      <h4>${name}</h4>
      <form method="post" action="/crime">
      <input type="hidden" name="crime" value="${name}">
      <button type="submit">Commit Crime</button>
      </form></div>`).join("")}
    </div>`;
  } else if(section==="GTA") {
    content=`<h3>GTA</h3><div class="panel-content">
    ${msg}<p>Choose what you want to do.</p>
    <div class="action"><h4>Steal a Car</h4>
    <form method="post" action="/gta">
    <input type="hidden" name="action" value="Steal a Car">
    <button type="submit">Steal a Car</button></form></div>
    <div class="action"><h4>Steal</h4>
    <form method="post" action="/gta">
    <input type="hidden" name="action" value="Steal">
    <button type="submit">Steal</button></form></div>
    </div>`;
  } else if(section==="Profile"||section==="My Stats") {
    content=`<h3>${escapeHtml(section)}</h3><div class="panel-content">
    <p>Player: ${escapeHtml(p.username)}</p>
    <p>Rank: ${escapeHtml(p.rank)}</p>
    <p>Cars owned: ${p.cars||0}</p>
    <p>Money: £${p.money.toLocaleString("en-GB")}</p>
    <p>Health: ${p.health}%</p></div>`;
  } else {
    content=`<h3>${escapeHtml(section)}</h3><div class="panel-content">
    <p>Welcome to InfamousMobsters, ${escapeHtml(p.username)}.</p>
    <p>Your criminal empire starts here.</p>
    </div>`;
  }

  res.send(page("Game",`
  <div class="layout">
  <aside><section class="panel"><h3>Navigation</h3><nav>${nav}</nav></section></aside>
  <main><section class="panel">${content}</section><p><a href="/logout">Log out</a></p></main>
  <aside><section class="panel"><h3>Player Stats</h3><div class="panel-content">
  <div class="stat"><span>Money</span><b>£${p.money.toLocaleString("en-GB")}</b></div>
  <div class="stat"><span>Points</span><b>${p.points}</b></div>
  <div class="stat"><span>Bullets</span><b>${p.bullets}</b></div>
  <div class="stat"><span>Cars</span><b>${p.cars||0}</b></div>
  <div class="stat"><span>Gun</span><b>None</b></div>
  <div class="stat"><span>Armour</span><b>None</b></div>
  <div class="stat"><span>Location</span><b>Coventry</b></div>
  <div class="stat"><span>Health</span><b>${p.health}%</b></div>
  <div class="stat"><span>Gang</span><b>None</b></div>
  <div class="stat"><span>Rank</span><b>${escapeHtml(p.rank)}</b></div>
  </div></section></aside>
  </div>`));
});

app.get("/logout",(req,res)=>req.session.destroy(()=>res.redirect("/login")));

const port=process.env.PORT||3000;
app.listen(port,"0.0.0.0",()=>console.log("InfamousMobsters running on "+port));
