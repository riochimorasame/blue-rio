const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const PORT = 3001;

// ==================================================================
// 🛑 RÈGLE D'OR : ON AUGMENTE LA CAPACITÉ TOUT EN HAUT 🛑
// ==================================================================
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

// --- CONNEXION MONGODB ---
const MONGO_URI = "mongodb+srv://enochmontcho2_db_user:R7WFCb8cO2YbMb2a@cluster0.secjrvl.mongodb.net/bluerio?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Connecté à MongoDB Atlas (Cloud)"))
    .catch(err => console.error("❌ Erreur de connexion MongoDB:", err));

const UserSchema = new mongoose.Schema({
    id: Number,
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    nom: String, prenom: String, age: String, sexe: String, telephone: String,
    role: { type: String, default: "UTILISATEUR" },
    avatar: String,
    avertissements: { type: Number, default: 0 }
});

const User = mongoose.model('User', UserSchema);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST", "DELETE"] } });

// Lives en mémoire
let livesEnCours = [{ id: 1, username: "Sarah_Mode", title: "Discussion Chill", viewers: 120 }];

// --- ROUTES ---
app.get('/', (req, res) => res.send('Serveur Blue Rio (50MB) en ligne ☁️'));

app.post('/register', async (req, res) => {
    const { nom, prenom, age, sexe, telephone, email, password, avatar } = req.body;
    try {
        const existe = await User.findOne({ email: email.toLowerCase().trim() });
        if (existe) return res.status(400).json({ success: false, message: "Email déjà pris !" });

        const newUser = new User({
            id: Date.now(),
            email: email.toLowerCase().trim(),
            password: password,
            nom, prenom, age, sexe, telephone,
            role: "UTILISATEUR",
            avatar: avatar || "👤",
            avertissements: 0
        });

        await newUser.save();
        console.log(`☁️ Nouvel inscrit : ${prenom}`);
        res.json({ success: true, user: newUser });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: "Erreur serveur (DB)" });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email: email.toLowerCase().trim(), password: password });
        if (user) res.json({ success: true, user });
        else res.status(401).json({ success: false, message: "Erreur identifiants" });
    } catch (e) { res.status(500).json({ success: false, message: "Erreur serveur" }); }
});

app.get('/users', async (req, res) => { const users = await User.find(); res.json(users); });
app.delete('/users/:id', async (req, res) => { await User.deleteOne({ id: parseInt(req.params.id) }); res.json({ success: true }); });
app.post('/users/:id/warn', async (req, res) => { await User.updateOne({ id: parseInt(req.params.id) }, { $inc: { avertissements: 1 } }); res.json({ success: true }); });

app.get('/lives', (req, res) => res.json(livesEnCours));
app.post('/add-live', (req, res) => { livesEnCours.unshift(req.body); io.emit('update_lives', livesEnCours); res.json({ success: true }); });

io.on('connection', (socket) => {
    socket.on('join_room', (id) => socket.join(id));
    socket.on('send_message', (d) => io.to(d.roomId).emit('receive_message', d));
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Serveur BLINDÉ (50MB) prêt sur le port ${PORT}`);
});