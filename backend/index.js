const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const PORT = 3001;

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST", "DELETE"] }
});

app.use(cors());
app.use(express.json());

// --- 1. BASE DE DONNÉES (DB) ---
let usersDB = [
    { id: 1, email: "admin@bluerio.com", password: "000", nom: "Chef", prenom: "Admin", age: 30, sexe: "H", telephone: "00000000", role: "ADMIN", avatar: "👑", avertissements: 0 },
    { id: 2, email: "tech@bluerio.com", password: "123", nom: "Yodi", prenom: "Esther", age: 25, sexe: "F", telephone: "90909090", role: "TECHNICIEN", avatar: "🛠️", avertissements: 0 }
];

let livesEnCours = [
    { id: 1, username: "Sarah_Mode", title: "Discussion Chill", viewers: 120 },
];

// --- ROUTES ---

app.get('/', (req, res) => res.send('Serveur Blue Rio v2 en ligne 🔒'));

// A. INSCRIPTION (NOUVEAU !)
app.post('/register', (req, res) => {
    const { nom, prenom, age, sexe, telephone, email, password } = req.body;

    // 1. Vérifier si l'email existe déjà
    const existeDeja = usersDB.find(u => u.email === email.toLowerCase().trim());
    if (existeDeja) {
        return res.status(400).json({ success: false, message: "Cet email est déjà utilisé !" });
    }

    // 2. Choisir un avatar selon le sexe
    let avatar = "👤";
    if (sexe === "F") avatar = "👩";
    if (sexe === "H") avatar = "👨";

    // 3. Créer le nouvel utilisateur
    const newUser = {
        id: Date.now(), // ID unique basé sur l'heure
        email: email.toLowerCase().trim(),
        password: password,
        nom: nom,
        prenom: prenom,
        age: age,
        sexe: sexe,
        telephone: telephone,
        role: "UTILISATEUR", // Par défaut, c'est un simple utilisateur
        avatar: avatar,
        avertissements: 0
    };

    // 4. Sauvegarder dans la DB
    usersDB.push(newUser);
    console.log(`🆕 Nouvel inscrit : ${prenom} ${nom} (${email})`);

    res.json({ success: true, user: newUser });
});

// B. LOGIN
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const emailClean = email ? email.trim().toLowerCase() : "";
    const passClean = password ? password.trim() : "";

    const user = usersDB.find(u => u.email === emailClean && u.password === passClean);

    if (user) {
        console.log(`✅ ${user.prenom} connecté`);
        res.json({ success: true, user: user });
    } else {
        res.status(401).json({ success: false, message: "Email ou mot de passe incorrect" });
    }
});

// C. ADMIN : GESTION USERS
app.get('/users', (req, res) => res.json(usersDB));

app.delete('/users/:id', (req, res) => {
    const id = parseInt(req.params.id);
    if (id === 1) return res.status(403).json({ success: false, message: "Impossible de supprimer le Chef !" });
    usersDB = usersDB.filter(u => u.id !== id);
    res.json({ success: true });
});

app.post('/users/:id/warn', (req, res) => {
    const user = usersDB.find(u => u.id === parseInt(req.params.id));
    if (user) {
        user.avertissements += 1;
        res.json({ success: true });
    }
});

// D. LIVES & CHAT
app.get('/lives', (req, res) => res.json(livesEnCours));
app.post('/add-live', (req, res) => {
    livesEnCours.unshift(req.body);
    io.emit('update_lives', livesEnCours);
    res.json({ success: true });
});

io.on('connection', (socket) => {
    socket.on('join_room', (id) => socket.join(id));
    socket.on('send_message', (d) => io.to(d.roomId).emit('receive_message', d));
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Serveur INSCRIPTION prêt sur le port ${PORT}`);
});