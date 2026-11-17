
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const pg = require("pg");
const PgSession = require("connect-pg-simple")(session);

const app = express();
app.set("trust proxy", 1);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false }
});

app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: "auto",
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}));

async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id SERIAL PRIMARY KEY,
      username VARCHAR(20) UNIQUE NOT NULL,
      password TEXT NOT NULL,
      money INTEGER DEFAULT 5000,
      points INTEGER DEFAULT 0,
      bullets INTEGER DEFAULT 0,
      health INTEGER DEFAULT 100,
      rank TEXT DEFAULT 'Newbie',
      last_crime INTEGER DEFAULT 0,
      last_gta INTEGER DEFAULT 0,
      cars INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS owned_cars (
      id SERIAL PRIMARY KEY,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      car_name TEXT NOT NULL,
      rarity TEXT NOT NULL,
      image TEXT NOT NULL,
      stolen_at BIGINT NOT NULL
    );
  `);
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;",
  '"': "&quot;", "'": "&#39;"
}[c]));

const carPool = [
  {name:"City Hatchback",rarity:"Common",image:"https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=800&q=80",weight:25},
  {name:"Street Coupe",rarity:"Common",image:"https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80",weight:25},
  {name:"Classic Sedan",rarity:"Common",image:"https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80",weight:25},
  {name:"Luxury GT",rarity:"Rare",image:"https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80",weight:10},
  {name:"Performance Coupe",rarity:"Rare",image:"https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=800&q=80",weight:10},
  {name:"Supercar",rarity:"Extremely Rare",image:"https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?auto=format&fit=crop&w=800&q=80",weight:2},
  {name:"Exotic Hypercar",rarity:"Extremely Rare",image:"https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80",weight:3}
];

function pickCar() {
  let roll = Math.random() * carPool.reduce((s,c) => s+c.weight, 0);
  for (const car of carPool) {
    roll -= car.weight;
    if (roll <= 0) return car;
  }
  return carPool[0];
}
const page = (title, body) => `<!DOCTYPE html>
<html lang="en"><head>
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
.layout{display:grid;grid-template-columns:180px minmax(0,1fr) 190px;gap:10px;padding:10px;max-width:1250px;margin:auto}
.panel{background:#192733;border:1px solid #344959;margin-bottom:10px}
.panel h3{margin:0;padding:9px;background:#263b4b;color:#e0bd79;font-size:14px}
.panel-content{padding:10px}
nav a{display:block;padding:8px;border-bottom:1px solid #2a3b48}
main{min-width:0}
button{padding:10px;margin:5px 0;background:#806238;border:0;color:white;width:100%;cursor:pointer;font-weight:bold}
button:hover{background:#a17c49}
input{padding:10px;margin:5px 0;background:#0e1922;border:1px solid #526879;color:white;width:100%}
.stat{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #2a3b48;gap:5px}
.action{background:#202f3b;border:1px solid #3a5060;padding:12px;margin:10px 0}
.message{padding:10px;background:#263b4b;border-left:3px solid #d9b56d;margin:10px 0}
.car-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.car-card{background:#202f3b;border:1px solid #405465;padding:8px}
.car-card img{width:100%;height:125px;object-fit:cover;display:block}
.car-card h4{margin:9px 0 5px}
.rarity{font-weight:bold;font-size:12px}
.Common{color:#b8c4ce}.Rare{color:#55b9ff}.Extremely-Rare{color:#d9a1ff}
@media(max-width:700px){.layout{grid-template-columns:1fr}.layout aside:first-child{order:1}main{order:0}.layout aside:last-child{order:2}}
</style></head><body>
<header><h1>INFAMOUSMOBSTERS</h1><p>Build your name. Rule the streets.</p></header>
${body}</body></html>`;

function requireLogin(req,res,next) {
  if (!req.session.player) return res.redirect("/login");
  next();
}

async function getPlayer(req) {
  const result = await pool.query("SELECT * FROM players WHERE id=$1",[req.session.player]);
  return result.rows[0];
}

app.get("/",(req,res)=>res.redirect(req.session.player?"/game":"/login"));

app.get("/register",(req,res)=>res.send(page("Register",`
<div class="layout"><main><section class="panel">
<h3>Create your account</h3><div class="panel-content">
<form method="post" action="/register">
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
    const result=await pool.query(
      "INSERT INTO players(username,password) VALUES($1,$2) RETURNING id",
      [username,hash]
    );
    req.session.player=result.rows[0].id;
    req.session.save(err=>{
      if(err) return res.status(500).send("Account created, but login failed. Please log in.");
      res.redirect("/game");
    });
  } catch(e) {
    console.error("Registration error:",e);
    res.status(400).send("That username may already be taken. <a href='/register'>Try again</a>");
  }
});

app.get("/login",(req,res)=>res.send(page("Login",`
<div class="layout"><main><section class="panel">
<h3>Player Login</h3><div class="panel-content">
<form method="post" action="/login">
<input name="username" placeholder="Username" required>
<input name="password" type="password" placeholder="Password" required>
<button>Log in</button></form>
<p>New here? <a href="/register">Create an account</a></p>
</div></section></main></div>`)));

app.post("/login",async(req,res)=>{
  try {
    const result=await pool.query(
      "SELECT * FROM players WHERE username=$1",
      [String(req.body.username||"").trim()]
    );
    const player=result.rows[0];

    if(!player||!await bcrypt.compare(String(req.body.password||""),player.password))
      return res.status(401).send("Incorrect username or password. <a href='/login'>Try again</a>");

    req.session.player=player.id;
    req.session.save(err=>{
      if(err) return res.status(500).send("Login could not be saved. Please try again.");
      res.redirect("/game");
    });
  } catch(e) {
    console.error("Login error:",e);
    res.status(500).send("Login error. Please try again later.");
  }
});

const crimes = {
  "Street Robbery":{min:100,max:250},
  "Shop Robbery":{min:250,max:500},
  "Warehouse Robbery":{min:500,max:900}
};

app.post("/crime",requireLogin,async(req,res)=>{
  const crime=crimes[String(req.body.crime||"")];
  if(!crime)return res.redirect("/game?section=Crimes");

  const p=await getPlayer(req);
  if(!p)return res.redirect("/logout");

  const now=Math.floor(Date.now()/1000);
  const wait=15-(now-(p.last_crime||0));
  if(wait>0)return res.redirect("/game?section=Crimes&msg="+encodeURIComponent("Please wait "+wait+" seconds."));

  const reward=Math.floor(Math.random()*(crime.max-crime.min+1))+crime.min;
  await pool.query("UPDATE players SET money=money+$1,last_crime=$2 WHERE id=$3",[reward,now,p.id]);
  res.redirect("/game?section=Crimes&msg="+encodeURIComponent("Success! You earned £"+reward.toLocaleString("en-GB")+"."));
});

app.post("/gta",requireLogin,async(req,res)=>{
  const p=await getPlayer(req);
  if(!p)return res.redirect("/logout");

  const now=Math.floor(Date.now()/1000);
  const wait=30-(now-(p.last_gta||0));
  if(wait>0)return res.redirect("/game?section=GTA&msg="+encodeURIComponent("Please wait "+wait+" seconds before trying again."));

  const car=pickCar();
  await pool.query(
    "INSERT INTO owned_cars(player_id,car_name,rarity,image,stolen_at) VALUES($1,$2,$3,$4,$5)",
    [p.id,car.name,car.rarity,car.image,now]
  );
  await pool.query("UPDATE players SET cars=cars+1,last_gta=$1 WHERE id=$2",[now,p.id]);

  res.redirect("/game?section=GTA&msg="+encodeURIComponent("You stole a "+car.name+"! Rarity: "+car.rarity+". Check My Garage."));
});

app.get("/game",requireLogin,async(req,res)=>{
  try {
    const p=await getPlayer(req);
    if(!p)return res.redirect("/logout");

    const links=["Game News","Get Help","Players Online","Top 10","Game Stats","Global Owners","Profile","My Stats","My Perks","My Items","My Garage","Notifications","Points","Buy Points","Crimes","GTA","Jail","Organised Crime","Missions","Bank","Bullets","Lottery","Hospital","Airport","Heist","Attempts","Kill"];
    const nav=links.map(x=>`<a href="/game?section=${encodeURIComponent(x)}">${x}</a>`).join("");
    const section=String(req.query.section||"Game News");
    const msg=req.query.msg?`<div class="message">${escapeHtml(req.query.msg)}</div>`:"";
    let content="";

    if(section==="Crimes") {
      content=`<h3>Crimes</h3><div class="panel-content">${msg}<p>Choose a crime to attempt.</p>
      ${Object.keys(crimes).map(name=>`<div class="action"><h4>${name}</h4>
      <form method="post" action="/crime"><input type="hidden" name="crime" value="${name}">
      <button>Commit Crime</button></form></div>`).join("")}</div>`;
    } else if(section==="GTA") {
      content=`<h3>GTA - Steal a Car</h3><div class="panel-content">${msg}
      <p>Try your luck and add a random car to your collection.</p>
      <form method="post" action="/gta"><button>Steal a Car</button></form>
      <p><a href="/game?section=My%20Garage">View My Garage</a></p></div>`;
    } else if(section==="My Garage") {
      const result=await pool.query("SELECT * FROM owned_cars WHERE player_id=$1 ORDER BY id DESC",[p.id]);
      const cars=result.rows;
      content=`<h3>My Garage</h3><div class="panel-content">${msg}
      <p>Cars collected: ${cars.length}</p>
      ${cars.length?`<div class="car-grid">${cars.map(car=>`
      <div class="car-card">
      <img src="${escapeHtml(car.image)}" alt="${escapeHtml(car.car_name)}" loading="lazy">
      <h4>${escapeHtml(car.car_name)}</h4>
      <div class="rarity ${car.rarity.replace(/ /g,"-")}">${escapeHtml(car.rarity)}</div>
      </div>`).join("")}</div>`:"<p>Your garage is empty. Visit GTA and steal your first car!</p>"}
      </div>`;
    } else if(section==="Profile"||section==="My Stats") {
      content=`<h3>${escapeHtml(section)}</h3><div class="panel-content">
      <p>Player: ${escapeHtml(p.username)}</p><p>Rank: ${escapeHtml(p.rank)}</p>
      <p>Cars owned: ${p.cars||0}</p><p>Money: £${Number(p.money).toLocaleString("en-GB")}</p>
      <p>Health: ${p.health}%</p></div>`;
    } else {
      content=`<h3>${escapeHtml(section)}</h3><div class="panel-content">
      <p>Welcome to InfamousMobsters, ${escapeHtml(p.username)}.</p>
      <p>Your criminal empire starts here.</p></div>`;
    }

    res.send(page("Game",`
    <div class="layout">
    <aside><section class="panel"><h3>Navigation</h3><nav>${nav}</nav></section></aside>
    <main><section class="panel">${content}</section><p><a href="/logout">Log out</a></p></main>
    <aside><section class="panel"><h3>Player Stats</h3><div class="panel-content">
    <div class="stat"><span>Money</span><b>£${Number(p.money).toLocaleString("en-GB")}</b></div>
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
  } catch(e) {
    console.error("Game page error:",e);
    res.status(500).send("Something went wrong loading the game. Please try again.");
  }
});

app.get("/logout",(req,res)=>req.session.destroy(()=>res.redirect("/login")));

const port=process.env.PORT||3000;

setupDatabase()
  .then(()=>app.listen(port,"0.0.0.0",()=>console.log("InfamousMobsters running on "+port)))
  .catch(err=>{
    console.error("Database startup failed:",err);
    process.exit(1);
  });
