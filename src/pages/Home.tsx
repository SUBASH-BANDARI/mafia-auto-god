import { useState } from 'react'
import { Button, Stack, TextField, Card, CardContent, Typography, Divider, Box, Alert } from '@mui/material'
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { auth, db, ensureAnon } from '../lib/firebase'
import { nanoid } from 'nanoid/non-secure'
import { PlayerDoc } from '../types'
import { saveRoomData } from '../lib/storage'
import { showNotification } from '../App'

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i=0;i<6;i++) s += chars[Math.floor(Math.random()*chars.length)]
  return s
}

export default function Home({ toLobby, toGame }: { toLobby: (roomId:string)=>void, toGame?: (roomId:string)=>void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function createRoom() {
    if (!name.trim()) {
      setError('Please enter your name')
      return
    }
    setLoading(true)
    setError('')
    try {
      await ensureAnon()
      const roomRef = await addDoc(collection(db, 'rooms'), {
        code: genCode(),
        createdBy: auth.currentUser!.uid,
        createdAt: Date.now(),
        phase: 'lobby',
        status: 'open',
        round: 0
      })
      // also create your player doc
      const userId = auth.currentUser!.uid
      console.log('Creating room with UID:', userId, 'Name:', name.trim())
      const pdoc = doc(db, 'rooms', roomRef.id, 'players', userId)
      await setDoc(pdoc, {
        displayName: name.trim() || 'Player',
        isAlive: true,
        role: null,
        nightVote: null,
        healTarget: null,
        dayVote: null,
        policeGuess: null
      }, { merge: true })
      // Wait a moment to ensure the document is written
      await new Promise(resolve => setTimeout(resolve, 100))
      console.log('Room created, host player document written. UID:', userId, 'Name:', name.trim())
      
      // Save room data to localStorage for persistence
      const roomData = await getDoc(roomRef)
      const roomCode = roomData.exists() ? roomData.data().code : undefined
      saveRoomData(roomRef.id, name.trim(), roomCode)
      
      showNotification('Room created successfully!', 'success')
      toLobby(roomRef.id)
    } catch (err: any) {
      setError('Failed to create room: ' + (err.message || 'Unknown error'))
      showNotification('Failed to create room: ' + (err.message || 'Unknown error'), 'error')
      setLoading(false)
    }
  }

  async function joinRoom() {
    if (!name.trim()) {
      setError('Please enter your name')
      return
    }
    if (!code.trim()) {
      setError('Please enter a room code')
      return
    }
    setLoading(true)
    setError('')
    try {
      await ensureAnon()
      const qy = query(collection(db, 'rooms'), where('code','==', code.trim().toUpperCase()))
      const snap = await getDocs(qy)
      if (snap.empty) { 
        setError('Room not found. Please check the room code.')
        showNotification('Room not found. Please check the room code.', 'error')
        setLoading(false)
        return 
      }
      const room = snap.docs[0]
      const roomData = room.data()
      if (roomData.status === 'ended') {
        setError('This game has already ended.')
        showNotification('This game has already ended.', 'error')
        setLoading(false)
        return
      }
      
      const userId = auth.currentUser!.uid
      console.log('Joining room with UID:', userId, 'Name:', name.trim())
      
      // Check if this user is already in the room
      const existingPlayerDoc = doc(db, 'rooms', room.id, 'players', userId)
      const existingPlayer = await getDoc(existingPlayerDoc)
      const isRejoining = existingPlayer.exists()
      
      // If game is in progress, only allow rejoining (existing players)
      if (roomData.status === 'in_progress' && !isRejoining) {
        setError('This game is already in progress. You cannot join as a new player.')
        showNotification('This game is already in progress. You cannot join as a new player.', 'error')
        setLoading(false)
        return
      }
      
      // If rejoining, update name if different
      if (isRejoining) {
        const existingData = existingPlayer.data() as PlayerDoc
        if (existingData.displayName !== name.trim()) {
          const updateName = confirm(
            `You're already in this room as "${existingData.displayName}". Do you want to update your name to "${name.trim()}"?`
          )
          if (!updateName) {
            setLoading(false)
            return
          }
        }
        // Rejoining - preserve existing role and status, just update name
        await setDoc(existingPlayerDoc, {
          displayName: name.trim() || existingData.displayName,
        }, { merge: true })
        console.log('Player rejoined, document updated. UID:', userId, 'Name:', name.trim())
        
        // Save room data to localStorage for persistence
        saveRoomData(room.id, name.trim(), roomData.code)
        
        // Navigate to game if in progress, otherwise lobby
        if (roomData.status === 'in_progress' && toGame) {
          // Navigate directly to game screen when rejoining an in-progress game
          console.log('Rejoining in-progress game, navigating directly to game screen')
          setTimeout(() => {
            toGame(room.id)
          }, 100)
        } else {
          // Navigate to lobby (will auto-navigate to game if phase is not lobby)
          toLobby(room.id)
        }
        return
      }
      
      // New player joining (game not in progress)
      const pdoc = doc(db, 'rooms', room.id, 'players', userId)
      await setDoc(pdoc, {
        displayName: name.trim() || 'Player',
        isAlive: true,
        role: null,
        nightVote: null,
        healTarget: null,
        dayVote: null,
        policeGuess: null
      }, { merge: true })
      // Wait a moment to ensure the document is written
      await new Promise(resolve => setTimeout(resolve, 100))
      console.log('Player joined, document written. UID:', userId, 'Name:', name.trim())
      
      // Save room data to localStorage for persistence
      saveRoomData(room.id, name.trim(), roomData.code)
      
      showNotification('Successfully joined room!', 'success')
      toLobby(room.id)
    } catch (err: any) {
      setError('Failed to join room: ' + (err.message || 'Unknown error'))
      showNotification('Failed to join room: ' + (err.message || 'Unknown error'), 'error')
      setLoading(false)
    }
  }

  return (
    <Stack spacing={3}>
      <TextField 
        label="Your name" 
        value={name} 
        onChange={e=>{setName(e.target.value); setError('')}} 
        fullWidth
        required
        placeholder="Enter your display name"
      />

      {error && (
        <Alert severity="error" sx={{ fontSize: '0.85rem', py: 1 }}>{error}</Alert>
      )}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>Join Existing Room</Typography>
            <Typography variant="body2" color="text.secondary">
              Enter the room code provided by the host to join their game.
            </Typography>
            <TextField 
              label="Room code" 
              value={code} 
              onChange={e=>{setCode(e.target.value.toUpperCase()); setError('')}} 
              fullWidth
              placeholder="Enter 6-character code"
              inputProps={{ maxLength: 6, style: { textTransform: 'uppercase', fontFamily: 'monospace', fontSize: '1.2em', letterSpacing: '0.1em' } }}
            />
            <Button 
              variant="contained" 
              onClick={joinRoom}
              disabled={loading}
              fullWidth
              size="large"
            >
              {loading ? 'Joining...' : 'Join Room'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Box sx={{ display: 'flex', alignItems: 'center', my: 1 }}>
        <Divider sx={{ flex: 1 }} />
        <Typography variant="body2" color="text.secondary" sx={{ px: 2 }}>
          OR
        </Typography>
        <Divider sx={{ flex: 1 }} />
      </Box>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>Create New Room</Typography>
            <Typography variant="body2" color="text.secondary">
              Start a new game. You'll be the host and can start the game when 4+ players join.
            </Typography>
            <Button 
              variant="outlined" 
              onClick={createRoom}
              disabled={loading}
              fullWidth
              size="large"
            >
              {loading ? 'Creating...' : 'Create Room'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  )
}
