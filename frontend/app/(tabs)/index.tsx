import React, { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  SafeAreaView, StatusBar, Animated, Dimensions, ScrollView, Platform, Alert, FlatList, Image, Modal 
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { io } from 'socket.io-client';
import * as ImagePicker from 'expo-image-picker';

// --- IMPORT AGORA (Pour la vraie vidéo sur le Web) ---
let AgoraRTC: any;
if (Platform.OS === 'web' && typeof window !== 'undefined') {
    AgoraRTC = require('agora-rtc-sdk-ng');
}

// ==================================================================
// 👇 TA NOUVELLE CLÉ AGORA (PROJET TEST) 👇
const AGORA_APP_ID = "84197686787f456c9b7990663e074b8f"; 
// ==================================================================

// Configuration Serveur
const SERVER_IP = Platform.OS === 'web' ? 'http://localhost:3001' : 'http://192.168.147.7:3001'; 
const socket = io(SERVER_IP);

const { width } = Dimensions.get('window');
const MENU_WIDTH = width * 0.75; 

export default function HomeScreen() {
  // --- ÉTATS ---
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [emailInput, setEmailInput] = useState(''); const [passwordInput, setPasswordInput] = useState('');
  const [regNom, setRegNom] = useState(''); const [regPrenom, setRegPrenom] = useState('');
  const [regAge, setRegAge] = useState(''); const [regSexe, setRegSexe] = useState(''); 
  const [regTel, setRegTel] = useState(''); const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState(''); const [regAvatar, setRegAvatar] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null); const [lives, setLives] = useState<any[]>([]); 
  const [showAdminPanel, setShowAdminPanel] = useState(false); const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]); const [searchText, setSearchText] = useState('');
  const [messages, setMessages] = useState<any[]>([]); const [chatMessage, setChatMessage] = useState('');
  
  const [currentLive, setCurrentLive] = useState<any>(null); 
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  
  const [permission, requestPermission] = useCameraPermissions();
  const slideAnim = useRef(new Animated.Value(-MENU_WIDTH)).current;
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // AGORA (Web)
  const [agoraClient, setAgoraClient] = useState<any>(null);
  const [localAudioTrack, setLocalAudioTrack] = useState<any>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<any>(null);

  // --- INIT ---
  useEffect(() => {
    socket.on('receive_message', (data) => setMessages((prev) => [...prev, data]));
    socket.on('update_lives', (newLives) => setLives(newLives));
    return () => { socket.off('receive_message'); socket.off('update_lives'); };
  }, []);

  // --- FONCTIONS AGORA (VRAIE VIDÉO WEB) ---
  const initAgora = async (channelName: string, role: 'host' | 'audience') => {
      if (!AgoraRTC) return; 
      
      try {
          const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
          setAgoraClient(client);

          if (role === 'audience') {
              // SPECTATEUR
              await client.setClientRole("audience");
              await client.join(AGORA_APP_ID, channelName, null, null);
              
              client.on("user-published", async (user: any, mediaType: any) => {
                  await client.subscribe(user, mediaType);
                  if (mediaType === "video") {
                      const remotePlayerContainer = document.getElementById("remote-player");
                      if (remotePlayerContainer) {
                          remotePlayerContainer.innerHTML = ''; 
                          user.videoTrack.play(remotePlayerContainer);
                      }
                  }
                  if (mediaType === "audio") user.audioTrack.play();
              });
          } else {
              // STREAMER
              await client.setClientRole("host");
              await client.join(AGORA_APP_ID, channelName, null, null);
              
              const [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks();
              setLocalAudioTrack(mic);
              setLocalVideoTrack(cam);
              
              const localPlayerContainer = document.getElementById("local-player");
              if (localPlayerContainer) {
                  localPlayerContainer.innerHTML = '';
                  cam.play(localPlayerContainer);
              }
              
              await client.publish([mic, cam]);
          }
      } catch (e) {
          console.error("Erreur Agora:", e);
          if (Platform.OS === 'web') alert("Erreur vidéo : Vérifiez la console (F12)");
      }
  };

  const leaveAgora = async () => {
      if(localAudioTrack) { localAudioTrack.close(); setLocalAudioTrack(null); }
      if(localVideoTrack) { localVideoTrack.close(); setLocalVideoTrack(null); }
      if(agoraClient) { await agoraClient.leave(); setAgoraClient(null); }
  };

  // --- AUTH & ADMIN ---
  const pickImage = async () => { let r = await ImagePicker.launchImageLibraryAsync({mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true}); if (!r.canceled && r.assets) setRegAvatar('data:image/jpeg;base64,' + r.assets[0].base64); };
  const register = async () => { if (!regNom || !regEmail || !regPass) return alert("Remplis tout !"); let av = regAvatar || "👤"; try { const r = await fetch(`${SERVER_IP}/register`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({nom:regNom, prenom:regPrenom, age:regAge, sexe:regSexe, telephone:regTel, email:regEmail, password:regPass, avatar:av})}); const d = await r.json(); if(d.success){ setUser(d.user); loadLives(); } else alert(d.message); } catch(e){} };
  const login = async () => { try { const r = await fetch(`${SERVER_IP}/login`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({email:emailInput, password:passwordInput})}); const d = await r.json(); if(d.success){ setUser(d.user); loadLives(); if(d.user.role==='ADMIN') loadAllUsers(); } else alert("Erreur login"); } catch(e){} };
  const loadLives = async () => { try { const r = await fetch(`${SERVER_IP}/lives`); setLives(await r.json()); } catch(e){} };
  const loadAllUsers = async () => { try { const r = await fetch(`${SERVER_IP}/users`); setAllUsers(await r.json()); } catch(e){} };
  const deleteUser = async (id: number) => { if(confirm("Supprimer ?")) { await fetch(`${SERVER_IP}/users/${id}`, { method: 'DELETE' }); loadAllUsers(); } };
  const warnUser = async (id: number) => { await fetch(`${SERVER_IP}/users/${id}/warn`, { method: 'POST' }); loadAllUsers(); };
  const renderAvatar = (s: string, size: number) => (s && s.startsWith('data:image')) ? <Image source={{uri:s}} style={{width:size, height:size, borderRadius:size/2}}/> : <Text style={{fontSize:size/2}}>{s}</Text>;
  
  // --- LIVE ACTIONS ---
  const startBroadcast = async () => {
    if (Platform.OS !== 'web' && !permission?.granted) await requestPermission();
    setIsBroadcasting(true);
    
    const channelId = String(Date.now()); 
    const monLive = { id: channelId, username: user.prenom, title: `Live de ${user.nom}`, viewers: 0 };
    
    await fetch(`${SERVER_IP}/add-live`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(monLive) });
    socket.emit('join_room', channelId);

    // Démarrage Agora (Web uniquement)
    if (Platform.OS === 'web') {
        setTimeout(() => initAgora(channelId, 'host'), 500);
    }
  };
  
  const joinLiveRoom = (live: any) => { 
      setCurrentLive(live); 
      setMessages([]); 
      socket.emit('join_room', live.id);
      if (Platform.OS === 'web') {
          setTimeout(() => initAgora(live.id, 'audience'), 500);
      }
  };

  const stopLive = () => {
      setIsBroadcasting(false);
      setCurrentLive(null);
      if (Platform.OS === 'web') leaveAgora();
  };

  const sendMessage = () => { socket.emit('send_message', { roomId: currentLive?.id, username: user.prenom, message: chatMessage }); setChatMessage(''); };
  const toggleMenu = () => { Animated.timing(slideAnim, { toValue: isMenuOpen ? -MENU_WIDTH : 0, duration: 300, useNativeDriver: false }).start(); setIsMenuOpen(!isMenuOpen); };
  const filteredUsers = allUsers.filter(u => u.nom?.toLowerCase().includes(searchText.toLowerCase()));

  // ================= VUES =================

  // 1. MODE STREAMER (Je diffuse)
  if (isBroadcasting) {
    return (
      <SafeAreaView style={styles.roomContainer}>
        {Platform.OS === 'web' ? (
            <div id="local-player" style={{ width: "100%", height: "100%", position: "absolute", backgroundColor: "black" }}></div>
        ) : (
            <CameraView style={{flex:1}} facing="front" />
        )}

        <View style={styles.overlay}>
            <View style={styles.broadcastHeader}><View style={styles.liveIndicatorBox}><View style={styles.redDot}/><Text style={styles.liveTextIndicator}>EN DIRECT (AGORA)</Text></View></View>
            <View style={styles.chatContainer}>
                <FlatList data={messages} keyExtractor={(i,x)=>x.toString()} renderItem={({item}) => <Text style={styles.chatMessage}><Text style={styles.chatUser}>{item.username}:</Text> {item.message}</Text>}/>
                <TouchableOpacity style={styles.stopButton} onPress={stopLive}><Text style={styles.stopButtonText}>ARRÊTER</Text></TouchableOpacity>
            </View>
        </View>
      </SafeAreaView>
    );
  }

  // 2. MODE SPECTATEUR (Je regarde)
  if (currentLive) {
    return (
      <SafeAreaView style={styles.roomContainer}>
        {Platform.OS === 'web' ? (
            <div id="remote-player" style={{ width: "100%", height: "100%", position: "absolute", backgroundColor: "black" }}></div>
        ) : (
             <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><Text style={{color:'white'}}>Vidéo disponible sur PC/Web</Text></View>
        )}

        <View style={styles.overlay}>
          <View style={styles.roomHeader}><Text style={styles.streamerName}>{currentLive.username}</Text><TouchableOpacity style={styles.closeButtonSmall} onPress={stopLive}><Text style={styles.closeButtonText}>❌</Text></TouchableOpacity></View>
          <View style={styles.chatContainer}>
            <FlatList data={messages} keyExtractor={(i,x)=>x.toString()} renderItem={({item}) => <Text style={styles.chatMessage}><Text style={styles.chatUser}>{item.username}:</Text> {item.message}</Text>} style={{maxHeight: 200}} />
            <View style={styles.inputRow}><TextInput style={styles.chatInput} placeholder="Message..." placeholderTextColor="#ccc" value={chatMessage} onChangeText={setChatMessage} /><TouchableOpacity style={styles.sendButton} onPress={sendMessage}><Text style={styles.sendText}>🚀</Text></TouchableOpacity></View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // 3. ACCUEIL
  if (user) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <Animated.View style={[styles.sideMenu, { transform: [{ translateX: slideAnim }] }]}>
          <View style={styles.menuHeader}><View style={styles.avatarLarge}>{renderAvatar(user.avatar, 80)}</View><Text style={styles.menuUsername}>{user.prenom}</Text><Text style={styles.menuRole}>{user.role}</Text></View>
          <View style={styles.menuItems}>
            <TouchableOpacity onPress={() => { toggleMenu(); setShowProfilePanel(true); }}><Text style={styles.menuItem}>👤 Mon Profil</Text></TouchableOpacity>
            {user.role === 'ADMIN' && <TouchableOpacity onPress={() => { toggleMenu(); setShowAdminPanel(true); }}><Text style={[styles.menuItem, {color: '#ff4757', fontWeight: 'bold'}]}>👮‍♂️ ADMIN PANEL</Text></TouchableOpacity>}
            <TouchableOpacity onPress={() => setUser(null)}><Text style={styles.menuItem}>Déconnexion</Text></TouchableOpacity>
          </View>
          <TouchableOpacity onPress={toggleMenu} style={styles.closeButton}><Text style={styles.closeText}>Fermer</Text></TouchableOpacity>
        </Animated.View>
        <View style={styles.headerCompact}><TouchableOpacity onPress={toggleMenu}><Text style={{fontSize: 24, color: 'white'}}>☰</Text></TouchableOpacity><Text style={styles.logoSmall}>Blue Rio 🌊</Text><View style={{width: 24}}/></View>
        <ScrollView contentContainerStyle={styles.scrollContent}><Text style={styles.sectionTitle}>Bonjour, {user.prenom} !</Text>{lives.map((live:any, i:number)=><TouchableOpacity key={i} style={styles.liveCard} onPress={()=>joinLiveRoom(live)}><View style={styles.livePreview}><Text style={styles.playIcon}>▶️</Text></View><View style={styles.liveInfo}><Text style={styles.liveUsername}>{live.username}</Text><Text style={styles.liveTitle}>{live.title}</Text></View></TouchableOpacity>)}</ScrollView>
        <TouchableOpacity style={styles.fabButton} onPress={startBroadcast}><Text style={styles.fabIcon}>📹</Text></TouchableOpacity>
      </SafeAreaView>
    );
  }

  // 4. VUES SECONDAIRES (PROFIL / ADMIN)
  if (showProfilePanel && user) return (<SafeAreaView style={styles.container}><View style={styles.headerCompact}><TouchableOpacity onPress={()=>setShowProfilePanel(false)}><Text style={{color:'white', fontSize:20}}>⬅️</Text></TouchableOpacity><Text style={{color:'#00d2ff', fontSize:20}}>PROFIL</Text></View><View style={{alignItems:'center', padding:20}}><View style={styles.avatarXLarge}>{renderAvatar(user.avatar, 100)}</View><Text style={styles.profileName}>{user.prenom} {user.nom}</Text><View style={styles.roleBadge}><Text style={{color:'white'}}>{user.role}</Text></View>{user.avertissements>0&&<View style={styles.warnBox}><Text style={{color:'white'}}>⚠️ {user.avertissements} Avertissements</Text></View>}</View></SafeAreaView>);
  if (showAdminPanel && user?.role === 'ADMIN') return (<SafeAreaView style={[styles.container, {backgroundColor:'#111'}]}><View style={styles.headerCompact}><TouchableOpacity onPress={()=>setShowAdminPanel(false)}><Text style={{color:'white'}}>⬅️</Text></TouchableOpacity><Text style={{color:'red', fontSize:20}}>ADMIN</Text></View><View style={{padding:15}}><TextInput style={styles.searchInput} placeholder="🔍 Recherche..." placeholderTextColor="#888" value={searchText} onChangeText={setSearchText}/></View><FlatList data={filteredUsers} renderItem={({item})=><View style={styles.userRow}><View style={{flexDirection:'row'}}>{renderAvatar(item.avatar, 40)}<View style={{marginLeft:10}}><Text style={{color:'white'}}>{item.nom}</Text><Text style={{color:'#888'}}>{item.role}</Text></View></View><View style={{flexDirection:'row'}}><TouchableOpacity onPress={()=>warnUser(item.id)} style={[styles.actionBtn, {backgroundColor:'orange'}]}><Text>⚠️</Text></TouchableOpacity><TouchableOpacity onPress={()=>deleteUser(item.id)} style={[styles.actionBtn, {backgroundColor:'red', marginLeft:5}]}><Text>🗑️</Text></TouchableOpacity></View></View>}/></SafeAreaView>);

  // 5. LOGIN
  return (<SafeAreaView style={styles.container}><ScrollView contentContainerStyle={{flexGrow:1, justifyContent:'center', padding:30}}><Text style={styles.logo}>Blue Rio 🌊</Text>{isRegisterMode ? (<><TouchableOpacity onPress={pickImage} style={styles.avatarPicker}>{regAvatar?<Image source={{uri:regAvatar}} style={{width:100,height:100,borderRadius:50}}/>:<Text style={{fontSize:40,color:'#555'}}>+</Text>}</TouchableOpacity><TextInput style={styles.input} placeholder="Nom" placeholderTextColor="#aaa" onChangeText={setRegNom}/><TextInput style={styles.input} placeholder="Email" placeholderTextColor="#aaa" onChangeText={setRegEmail}/><TextInput style={styles.input} placeholder="Mdp" placeholderTextColor="#aaa" onChangeText={setRegPass}/><TouchableOpacity style={styles.loginButton} onPress={register}><Text style={styles.loginButtonText}>S'INSCRIRE</Text></TouchableOpacity><TouchableOpacity onPress={()=>setIsRegisterMode(false)}><Text style={{color:'#00d2ff', textAlign:'center', marginTop:20}}>Retour</Text></TouchableOpacity></>) : (<><TextInput style={styles.input} placeholder="Email" placeholderTextColor="#aaa" onChangeText={setEmailInput}/><TextInput style={styles.input} placeholder="Mdp" placeholderTextColor="#aaa" onChangeText={setPasswordInput}/><TouchableOpacity style={styles.loginButton} onPress={login}><Text style={styles.loginButtonText}>CONNEXION</Text></TouchableOpacity><TouchableOpacity onPress={()=>setIsRegisterMode(true)}><Text style={{color:'#00d2ff', textAlign:'center', marginTop:20}}>Créer un compte</Text></TouchableOpacity></>)}</ScrollView></SafeAreaView>);
}

// STYLES
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f2027' },
  userRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#222', padding: 15, marginBottom: 10, borderRadius: 8, alignItems: 'center' },
  searchInput: { backgroundColor: '#333', padding: 15, borderRadius: 10, color: 'white', fontSize: 16 },
  actionBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  roomContainer: { flex: 1, backgroundColor: 'black' },
  logo: { fontSize: 36, fontWeight: 'bold', color: '#00d2ff', textAlign: 'center', marginBottom: 20 },
  welcomeText: { fontSize: 18, color: '#ccc', marginBottom: 30, textAlign: 'center' },
  input: { backgroundColor: '#203a43', color: 'white', padding: 15, borderRadius: 10, marginBottom: 15 },
  loginButton: { backgroundColor: '#00d2ff', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  loginButtonText: { color: '#0f2027', fontWeight: 'bold', fontSize: 18 },
  headerCompact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 40, backgroundColor: '#1e3c4a' },
  logoSmall: { fontSize: 20, fontWeight: 'bold', color: '#00d2ff' },
  scrollContent: { padding: 20 },
  sectionTitle: { color: 'white', fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  liveCard: { backgroundColor: '#203a43', borderRadius: 15, marginBottom: 20, overflow: 'hidden' },
  livePreview: { height: 150, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' },
  playIcon: { fontSize: 40 },
  liveInfo: { padding: 15 },
  liveUsername: { color: '#00d2ff', fontWeight: 'bold' },
  liveTitle: { color: 'white' },
  fabButton: { position: 'absolute', bottom: 30, right: 30, width: 60, height: 60, borderRadius: 30, backgroundColor: '#00d2ff', justifyContent: 'center', alignItems: 'center' },
  fabIcon: { fontSize: 30 },
  sideMenu: { position: 'absolute', left: 0, top: 0, bottom: 0, width: MENU_WIDTH, backgroundColor: '#1e3c4a', zIndex: 100, padding: 20, borderRightWidth: 1, borderRightColor: '#00d2ff' },
  menuHeader: { marginTop: 50, marginBottom: 40, alignItems: 'center' },
  avatarLarge: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#203a43', justifyContent: 'center', alignItems: 'center', marginBottom: 10, overflow: 'hidden' },
  menuUsername: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  menuRole: { color: '#aaa', fontSize: 14 },
  menuItems: { flex: 1 },
  menuItem: { color: '#ccc', fontSize: 18, paddingVertical: 15, borderBottomWidth: 0.5, borderBottomColor: '#333' },
  closeButton: { backgroundColor: '#ff4757', padding: 10, borderRadius: 5, alignItems: 'center', marginBottom: 20 },
  closeText: { color: 'white', fontWeight: 'bold' },
  stopButton: { backgroundColor: '#ff4757', padding: 10, borderRadius: 20, alignSelf: 'center', marginTop: 50, width: 150, alignItems: 'center' },
  stopButtonText: { color: 'white', fontWeight: 'bold' },
  videoPlayer: { position: 'absolute', top: 0, left: 0, bottom: 0, right: 0 },
  closeButtonSmall: { position: 'absolute', top: 40, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', padding: 10, borderRadius: 20 },
  closeButtonText: { color: 'white', fontSize: 20 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.1)' },
  broadcastHeader: { padding: 20, paddingTop: 40 },
  liveIndicatorBox: { flexDirection: 'row', backgroundColor: 'red', padding: 5, borderRadius: 5, alignSelf: 'flex-start', alignItems: 'center' },
  redDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'white', marginRight: 5 },
  liveTextIndicator: { color: 'white', fontWeight: 'bold' },
  chatContainer: { padding: 20, backgroundColor: 'rgba(0,0,0,0.6)', maxHeight: '40%' },
  chatMessage: { color: 'white', marginBottom: 5 },
  chatUser: { color: '#00d2ff', fontWeight: 'bold' },
  inputRow: { flexDirection: 'row', marginTop: 10 },
  chatInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 10, color: 'white', height: 40 },
  sendButton: { marginLeft: 10, justifyContent: 'center' },
  sendText: { fontSize: 20 },
  roomHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, paddingTop: 40 },
  streamerName: { color: 'white', fontSize: 18, fontWeight: 'bold', textShadowColor: 'black', textShadowRadius: 5 },
  avatarPicker: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#00d2ff' },
  profileCard: { backgroundColor: '#1e3c4a', width: '100%', padding: 20, borderRadius: 20, alignItems: 'center' },
  avatarXLarge: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#203a43', justifyContent: 'center', alignItems: 'center', marginBottom: 15, overflow: 'hidden', borderWidth: 3, borderColor: '#00d2ff' },
  profileName: { color: 'white', fontSize: 26, fontWeight: 'bold' },
  roleBadge: { backgroundColor: '#00d2ff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, marginTop: 5 },
  warnBox: { backgroundColor: 'rgba(255, 0, 0, 0.3)', padding: 15, borderRadius: 10, width: '100%', marginBottom: 20, borderWidth: 1, borderColor: 'red' }
});