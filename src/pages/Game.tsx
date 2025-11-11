import { useEffect, useMemo, useState } from 'react'
import { auth, db } from '../lib/firebase'
import { collection, doc, getDoc, getDocs, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { Avatar, Box, Button, Card, CardContent, Chip, Dialog, DialogContent, Divider, MenuItem, Select, Stack, Typography } from '@mui/material'
import { Phase, PlayerDoc, Room } from '../types'
import { tally, winCheck } from '../lib/gameLogic'
import { clearRoomData } from '../lib/storage'
import RoleAvatar from '../components/RoleAvatar'
import { getRoleInfo } from '../lib/roleUtils'
import { showNotification } from '../App'
import { nanoid } from 'nanoid/non-secure'

export default function Game({ roomId }: { roomId:string }) {
  const [room, setRoom] = useState<Room|null>(null)
  const [players, setPlayers] = useState<Record<string, PlayerDoc>>({})
  const [my, setMy] = useState<PlayerDoc|null>(null)
  const [myId, setMyId] = useState<string|undefined>(undefined)
  const [isSubmittingPoliceGuess, setIsSubmittingPoliceGuess] = useState(false)
  const [showPoliceGuessResult, setShowPoliceGuessResult] = useState(false)
  const [hasShownPoliceGuessResult, setHasShownPoliceGuessResult] = useState(false)
  const [policeGuessCountdown, setPoliceGuessCountdown] = useState(0)
  const [showRoleFlashScreen, setShowRoleFlashScreen] = useState(false)
  const [hasShownRoleFlash, setHasShownRoleFlash] = useState(false)
  
  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  const allPlayerEntries = useMemo(()=> Object.entries(players), [players])
  const deadEntries = useMemo(()=> Object.entries(players).filter(([id,p])=>!p.isAlive), [players])
  const aliveEntries = useMemo(()=> Object.entries(players).filter(([id,p])=>p.isAlive), [players])
  const aliveIds = useMemo(()=> aliveEntries.map(([id])=>id), [aliveEntries])
  
  // Early return if no roomId (after hooks)
  if (!roomId) {
    return (
      <Card>
        <CardContent>
          <Typography color="error">Error: No room ID provided</Typography>
        </CardContent>
      </Card>
    )
  }
  
  console.log('Game component rendered with roomId:', roomId)
  console.log('Game state - room:', room ? {phase: room.phase, code: room.code} : 'null', 'my:', my ? {name: my.displayName, role: my.role} : 'null', 'myId:', myId)

  useEffect(() => {
    try {
      const userId = auth.currentUser?.uid
      setMyId(userId)
      
      if (!userId) {
        console.error('No user ID found')
        return
      }
      
      console.log('Game: Setting up listeners for roomId:', roomId, 'userId:', userId)
      
      const unsubRoom = onSnapshot(
        doc(db, 'rooms', roomId), 
        async (d)=> {
          try {
            if (d.exists()) {
              const roomData = d.data() as Room
              console.log('Game: Room data received:', { phase: roomData.phase, code: roomData.code })
              setRoom(roomData)
              
              // Immediately check if we need to auto-advance when phase changes to police
              if (roomData.phase === 'night_police') {
                // Small delay to ensure players state is synced
                setTimeout(async () => {
                  try {
                    // Get fresh players data
                    const playersSnap = await getDocs(collection(db, 'rooms', roomId, 'players'))
                    const playersMap: Record<string, PlayerDoc> = {}
                    playersSnap.forEach(doc => {
                      if (doc.exists()) {
                        playersMap[doc.id] = doc.data() as PlayerDoc
                      }
                    })
                    
                    // Re-check phase hasn't changed
                    const currentRoomSnap = await getDoc(doc(db, 'rooms', roomId))
                    if (!currentRoomSnap.exists() || currentRoomSnap.data()?.phase !== 'night_police') {
                      return // Phase already changed
                    }
                    
                    // Check if police already guessed
                    const alivePolice = Object.entries(playersMap).filter(([id, p]) => p.role === 'police' && p.isAlive)
                    console.log('Checking police phase - alive police:', alivePolice.length, 'players:', alivePolice.map(([id, p]) => ({ id, name: p.displayName, hasGuess: !!p.policeGuess })))
                    
                    if (alivePolice.length > 0) {
                      const policeWithGuess = alivePolice.filter(([id, p]) => p.policeGuess !== null && p.policeGuess !== undefined)
                      console.log('Police with guess:', policeWithGuess.length, 'out of', alivePolice.length)
                      if (policeWithGuess.length === alivePolice.length) {
                        // All police already guessed, skip to healer phase immediately
                        console.log('✅ Police already guessed, auto-advancing to healer phase')
                        await updateDoc(doc(db, 'rooms', roomId), { phase: 'night_healer' })
                      }
                    } else if (alivePolice.length === 0) {
                      // No police alive, skip to healer
                      console.log('No police alive, auto-advancing to healer phase')
                      await updateDoc(doc(db, 'rooms', roomId), { phase: 'night_healer' })
                    }
                  } catch (err) {
                    console.error('Error in police phase auto-advance check:', err)
                  }
                }, 300)
              }
            } else {
              console.error('Room not found:', roomId)
            }
          } catch (err) {
            console.error('Error processing room data:', err)
          }
        },
        (error) => {
          console.error('Error listening to room:', error)
        }
      )
      
      const unsubPlayers = onSnapshot(
        collection(db, 'rooms', roomId, 'players'), 
        (snap)=> {
          try {
            const map: Record<string, PlayerDoc> = {}
            snap.forEach(doc => { 
              if (doc.exists()) {
                map[doc.id] = doc.data() as PlayerDoc 
              }
            })
            console.log('Game: Players loaded:', Object.keys(map).length, 'players')
            setPlayers(map)
          } catch (err) {
            console.error('Error processing players data:', err)
          }
        },
        (error) => {
          console.error('Error listening to players:', error)
        }
      )
      
      return () => { 
        console.log('Game: Cleaning up listeners')
        unsubRoom(); 
        unsubPlayers(); 
      }
    } catch (error) {
      console.error('Error in Game useEffect:', error)
    }
  }, [roomId])

  useEffect(() => {
    if (myId) {
      const myPlayer = players[myId] || null
      console.log('Setting my player:', myPlayer ? {name: myPlayer.displayName, role: myPlayer.role} : 'null')
      setMy(myPlayer)
    }
  }, [players, myId])

  // Reset submission state when phase changes
  useEffect(() => {
    if (room?.phase !== 'night_police') {
      setIsSubmittingPoliceGuess(false)
      setShowPoliceGuessResult(false)
    }
  }, [room?.phase])

  // Reset hasShownPoliceGuessResult when a new guess is made
  useEffect(() => {
    const savedGuess = players[myId || '']?.policeGuess
    if (!savedGuess) {
      setHasShownPoliceGuessResult(false)
    }
  }, [players, myId])

  // Show role flash screen when game starts (first time role is assigned)
  useEffect(() => {
    if (!my || !my.role || !room || !myId) return
    
    // Check if we've already shown the flash screen for this game
    const flashScreenKey = `roleFlash_${roomId}_${myId}`
    const hasShownFlash = localStorage.getItem(flashScreenKey) === 'true'
    
    // Show flash screen if:
    // 1. Role is assigned
    // 2. Game has started (not in lobby)
    // 3. We haven't shown it before
    // 4. Phase is night_mafia (game just started) or we're transitioning from assign_roles
    if (!hasShownFlash && 
        room.phase !== 'lobby' && 
        room.phase !== 'ended' &&
        (room.phase === 'night_mafia' || room.phase === 'assign_roles')) {
      setShowRoleFlashScreen(true)
      setHasShownRoleFlash(true)
      
      // Mark as shown in localStorage
      localStorage.setItem(flashScreenKey, 'true')
      
      // Hide after 5 seconds
      const timer = setTimeout(() => {
        setShowRoleFlashScreen(false)
      }, 5000)
      
      return () => clearTimeout(timer)
    } else if (hasShownFlash) {
      setHasShownRoleFlash(true)
    }
  }, [my?.role, room?.phase, roomId, myId])

  // Clear localStorage when game ends
  useEffect(() => {
    if (room?.phase === 'ended' || room?.status === 'ended') {
      console.log('Game ended, clearing saved room data from localStorage')
      clearRoomData()
      // Also clear role flash screen flag so it can be shown in next game
      if (myId) {
        const flashScreenKey = `roleFlash_${roomId}_${myId}`
        localStorage.removeItem(flashScreenKey)
      }
    }
  }, [room?.phase, room?.status, roomId, myId])

  // Submit functions for each phase
  async function submitMafia() {
    if (!my || !myId || !room || room.phase !== 'night_mafia' || my.role !== 'mafia') return
    if (!my.nightVote) {
      showNotification('Please select a target to kill.', 'warning')
      return
    }
    await setDoc(doc(db, 'rooms', roomId, 'players', myId), { nightVote: my.nightVote }, { merge: true })
    showNotification('Mafia target submitted!', 'success')
    // Auto-advance if all mafia have submitted
    checkAndAdvanceMafiaPhase()
  }

  async function submitPolice() {
    if (!my || !myId || !room || room.phase !== 'night_police' || my.role !== 'police') return
    // Check if police has already guessed (only one guess per game)
    if (my.policeGuess && players[myId]?.policeGuess) {
      showNotification('You have already made your guess. You can only guess once per game.', 'warning')
      // Still advance phase if police already guessed
      await updateDoc(doc(db, 'rooms', roomId), { phase: 'night_healer' })
      return
    }
    if (!my.policeGuess) {
      showNotification('Please select a player to guess.', 'warning')
      return
    }
    
    setIsSubmittingPoliceGuess(true)
    
    try {
      // Save the guess to Firestore
      const updates: any = { policeGuess: my.policeGuess }
      await setDoc(doc(db, 'rooms', roomId, 'players', myId), updates, { merge: true })
      
      // Wait a moment for Firestore to sync
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Show the result for 5 seconds with countdown (memory game - police needs to remember)
      setShowPoliceGuessResult(true)
      setHasShownPoliceGuessResult(true)
      setPoliceGuessCountdown(5)
      
      // Countdown timer
      const countdownInterval = setInterval(() => {
        setPoliceGuessCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval)
            return 0
          }
          return prev - 1
        })
      }, 1000)
      
      // After showing feedback for 5 seconds, hide it and advance to next phase
      setTimeout(async () => {
        try {
          clearInterval(countdownInterval)
          // Hide the result (memory game - police must remember)
          setShowPoliceGuessResult(false)
          setPoliceGuessCountdown(0)
          
          // Double-check phase hasn't changed
          const roomSnap = await getDoc(doc(db, 'rooms', roomId))
          if (roomSnap.exists() && roomSnap.data()?.phase === 'night_police') {
            await updateDoc(doc(db, 'rooms', roomId), { phase: 'night_healer' })
            console.log('Police: Auto-advanced to healer phase after showing feedback')
          }
        } catch (error) {
          console.error('Error auto-advancing phase:', error)
        }
      }, 5000) // 5 second delay to show feedback
    } catch (error) {
      console.error('Error submitting police guess:', error)
      showNotification('Failed to submit guess. Please try again.', 'error')
      setIsSubmittingPoliceGuess(false)
    }
  }

  async function submitHealer() {
    if (!my || !myId || !room || room.phase !== 'night_healer' || my.role !== 'healer') return
    if (!my.healTarget) {
      showNotification('Please select someone to heal.', 'warning')
      return
    }
    await setDoc(doc(db, 'rooms', roomId, 'players', myId), { healTarget: my.healTarget }, { merge: true })
    showNotification('Heal target submitted!', 'success')
    // Auto-advance if healer has submitted
    checkAndAdvanceHealerPhase()
  }

  // Auto-advance functions
  async function checkAndAdvanceMafiaPhase() {
    if (!room || room.phase !== 'night_mafia') return
    // Re-check room state to ensure phase hasn't changed
    const roomSnap = await getDoc(doc(db, 'rooms', roomId))
    if (!roomSnap.exists()) return
    const currentRoom = roomSnap.data() as Room
    if (currentRoom.phase !== 'night_mafia') return // Phase already changed
    
    // Get fresh player data
    const playersSnap = await getDocs(collection(db, 'rooms', roomId, 'players'))
    const freshPlayers: Record<string, PlayerDoc> = {}
    playersSnap.forEach(doc => {
      if (doc.exists()) {
        freshPlayers[doc.id] = doc.data() as PlayerDoc
      }
    })
    
    const aliveMafia = Object.entries(freshPlayers).filter(([id, p]) => p.role === 'mafia' && p.isAlive)
    const submittedMafia = aliveMafia.filter(([id, p]) => p.nightVote !== null && p.nightVote !== undefined)
    
    // Check if all Mafia have voted
    if (aliveMafia.length > 0 && submittedMafia.length === aliveMafia.length) {
      // Calculate vote tally
      const votes: Record<string, string | null> = {}
      const alive: Record<string, boolean> = {}
      for (const [uid, p] of Object.entries(freshPlayers)) {
        alive[uid] = p.isAlive
        if (p.role === 'mafia' && p.isAlive && p.nightVote) {
          votes[uid] = p.nightVote
        }
      }
      
      const voteResult = tally(votes, alive)
      
      // Check for majority (more than half of Mafia voted for the same target)
      const mafiaCount = aliveMafia.length
      const majorityThreshold = Math.floor(mafiaCount / 2) + 1
      
      if (voteResult && voteResult.votes >= majorityThreshold) {
        // Majority reached, advance to next phase
        await updateDoc(doc(db, 'rooms', roomId), { phase: 'night_police' })
      } else {
        // Tie or no majority - clear votes for re-vote
        console.log('Mafia vote tie detected, clearing votes for re-vote')
        for (const [uid, p] of Object.entries(freshPlayers)) {
          if (p.role === 'mafia' && p.isAlive) {
            await setDoc(doc(db, 'rooms', roomId, 'players', uid), { nightVote: null }, { merge: true })
          }
        }
        // Show alert to Mafia about tie
        // Note: This will be handled in UI
      }
    }
  }

  async function checkAndAdvancePolicePhase() {
    if (!room || room.phase !== 'night_police') return
    // Re-check room state to ensure phase hasn't changed
    const roomSnap = await getDoc(doc(db, 'rooms', roomId))
    if (!roomSnap.exists()) return
    const currentRoom = roomSnap.data() as Room
    if (currentRoom.phase !== 'night_police') return // Phase already changed
    
    const alivePolice = Object.entries(players).filter(([id, p]) => p.role === 'police' && p.isAlive)
    if (alivePolice.length === 0) {
      // No police alive, skip to healer phase
      await updateDoc(doc(db, 'rooms', roomId), { phase: 'night_healer' })
      return
    }
    // Check if police has already guessed (police only guesses once per game)
    // If they already have a guess, skip this phase
    const policeWithGuess = alivePolice.filter(([id, p]) => p.policeGuess !== null && p.policeGuess !== undefined)
    if (policeWithGuess.length === alivePolice.length) {
      // Police already guessed, move to healer phase immediately
      await updateDoc(doc(db, 'rooms', roomId), { phase: 'night_healer' })
      return
    }
  }

  async function checkAndAdvanceHealerPhase() {
    if (!room || room.phase !== 'night_healer') return
    // Re-check room state to ensure phase hasn't changed
    const roomSnap = await getDoc(doc(db, 'rooms', roomId))
    if (!roomSnap.exists()) return
    const currentRoom = roomSnap.data() as Room
    if (currentRoom.phase !== 'night_healer') return // Phase already changed
    
    const aliveHealer = Object.entries(players).filter(([id, p]) => p.role === 'healer' && p.isAlive)
    if (aliveHealer.length === 0) {
      // No healer alive, resolve night and move to day
      await resolveNightActions()
      return
    }
    const submittedHealer = aliveHealer.filter(([id, p]) => p.healTarget !== null && p.healTarget !== undefined)
    if (submittedHealer.length === aliveHealer.length) {
      // Healer has submitted, resolve night and move to day
      await resolveNightActions()
    }
  }

  // Resolve all night actions and move to day
  async function resolveNightActions() {
    if (!room) return
    
    // Get fresh player data from Firestore to avoid race conditions
    const playersSnap = await getDocs(collection(db, 'rooms', roomId, 'players'))
    const freshPlayers: Record<string, PlayerDoc> = {}
    playersSnap.forEach(doc => {
      if (doc.exists()) {
        freshPlayers[doc.id] = doc.data() as PlayerDoc
      }
    })
    
    // Mafia target: most voted by alive mafias
    const votes: Record<string,string|null> = {}
    const alive: Record<string,boolean> = {}
    const healedTargets: string[] = []
    for (const [uid, p] of Object.entries(freshPlayers)) {
      alive[uid] = p.isAlive
      if (p.role === 'mafia' && p.isAlive && p.nightVote) {
        votes[uid] = p.nightVote
      }
      if (p.role === 'healer' && p.isAlive && p.healTarget) {
        healedTargets.push(p.healTarget)
      }
    }
    const top = tally(votes, alive)
    let killed: string|undefined = top?.target
    let wasHealed = false
    let healedPlayerName = ''
    
    // if any healer targeted the killed person, they are saved (no kill)
    if (killed && healedTargets.includes(killed)) {
      wasHealed = true
      healedPlayerName = freshPlayers[killed]?.displayName || 'someone'
      killed = undefined // Healer saved them, no one dies
    }
    
    if (killed) {
      await setDoc(doc(db, 'rooms', roomId, 'players', killed), { isAlive: false }, { merge: true })
      // Wait a moment for Firestore to sync
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    
    // clear night temp fields (but keep policeGuess if already set - police only guesses once)
    for (const [uid, p] of Object.entries(freshPlayers)) {
      const updates: any = { nightVote: null, healTarget: null }
      // Only clear policeGuess if it's not already set (police only guesses once per game)
      if (p.role !== 'police' || !p.policeGuess) {
        // Don't clear policeGuess if police already guessed
      }
      await setDoc(doc(db, 'rooms', roomId, 'players', uid), updates, { merge: true })
    }
    
    // Store night result for display
    const nightResult: any = {}
    if (wasHealed) {
      nightResult.healed = true
      nightResult.healedPlayer = healedPlayerName
    } else if (killed) {
      nightResult.killed = killed
    }
    
    // Get fresh player data again after all updates for accurate win check
    const finalPlayersSnap = await getDocs(collection(db, 'rooms', roomId, 'players'))
    const finalPlayers: Record<string, PlayerDoc> = {}
    finalPlayersSnap.forEach(doc => {
      if (doc.exists()) {
        finalPlayers[doc.id] = doc.data() as PlayerDoc
      }
    })
    
    // win check with fresh data
    const wc = winCheck(finalPlayers)
    if (wc) {
      console.log('resolveNightActions: Game ended, winner:', wc)
      await updateDoc(doc(db, 'rooms', roomId), { 
        phase: 'ended', 
        status: 'ended',
        winner: wc,
        lastNightResult: nightResult
      })
    } else {
      await updateDoc(doc(db, 'rooms', roomId), { 
        phase: 'day',
        lastNightResult: nightResult
      })
    }
  }

  async function submitDay() {
    if (!my || !myId || !room || room.phase !== 'day') return
    await setDoc(doc(db, 'rooms', roomId, 'players', myId), { dayVote: my.dayVote ?? null }, { merge: true })
    showNotification('Day vote submitted.', 'success')
    // Trigger auto-advance check after submission
    setTimeout(() => checkAndAdvanceDayPhase(), 300)
  }

  // Auto-advance day phase when all alive players have voted
  async function checkAndAdvanceDayPhase() {
    if (!room || room.phase !== 'day') return
    // Re-check room state to ensure phase hasn't changed
    const roomSnap = await getDoc(doc(db, 'rooms', roomId))
    if (!roomSnap.exists()) return
    const currentRoom = roomSnap.data() as Room
    if (currentRoom.phase !== 'day') return // Phase already changed
    
    const alivePlayers = Object.entries(players).filter(([id, p]) => p.isAlive)
    const votedPlayers = alivePlayers.filter(([id, p]) => p.dayVote !== null && p.dayVote !== undefined)
    
    if (alivePlayers.length > 0 && votedPlayers.length === alivePlayers.length) {
      // All alive players have voted, resolve day phase
      console.log('All players voted, auto-resolving day phase')
      await resolveDay()
    }
  }

  // Auto-check phase advancement when players update
  useEffect(() => {
    if (!room || !myId) return
    
    // Only auto-check phases that need to wait for multiple players
    const performChecks = async () => {
      if (room.phase === 'night_mafia') {
        await checkAndAdvanceMafiaPhase()
      } else if (room.phase === 'night_police') {
        // Check if police already guessed (from previous round) - auto-skip immediately
        const alivePolice = Object.entries(players).filter(([id, p]) => p.role === 'police' && p.isAlive)
        console.log('useEffect: Checking police phase - alive police:', alivePolice.length)
        console.log('useEffect: Police data:', alivePolice.map(([id, p]) => ({ name: p.displayName, hasGuess: !!p.policeGuess, guess: p.policeGuess })))
        
        if (alivePolice.length === 0) {
          // No police alive, skip to healer immediately
          console.log('useEffect: No police alive, advancing to healer')
          await updateDoc(doc(db, 'rooms', roomId), { phase: 'night_healer' })
        } else {
          // Check if all alive police have already guessed
          const policeWithGuess = alivePolice.filter(([id, p]) => p.policeGuess !== null && p.policeGuess !== undefined)
          console.log('useEffect: Police with guess:', policeWithGuess.length, 'out of', alivePolice.length)
          if (policeWithGuess.length === alivePolice.length && alivePolice.length > 0) {
            // All police already guessed, skip to healer phase immediately
            console.log('useEffect: ✅ All police guessed, auto-advancing to healer phase')
            await updateDoc(doc(db, 'rooms', roomId), { phase: 'night_healer' })
          }
        }
      } else if (room.phase === 'night_healer') {
        await checkAndAdvanceHealerPhase()
      } else if (room.phase === 'day') {
        await checkAndAdvanceDayPhase()
      }
    }
    
    // Small delay to ensure state is synced
    const timeoutId = setTimeout(performChecks, 100)
    return () => clearTimeout(timeoutId)
  }, [players, room?.phase, roomId])

  async function resolveDay() {
    if (!room) return
    
    // Get fresh player data from Firestore to avoid race conditions
    const playersSnap = await getDocs(collection(db, 'rooms', roomId, 'players'))
    const freshPlayers: Record<string, PlayerDoc> = {}
    playersSnap.forEach(doc => {
      if (doc.exists()) {
        freshPlayers[doc.id] = doc.data() as PlayerDoc
      }
    })
    
    const votes: Record<string,string|null> = {}
    const alive: Record<string,boolean> = {}
    for (const [uid, p] of Object.entries(freshPlayers)) {
      alive[uid] = p.isAlive
      votes[uid] = p.dayVote ?? null
    }
    const top = tally(votes, alive)
    const killed = top?.target
    if (killed) {
      await setDoc(doc(db, 'rooms', roomId, 'players', killed), { isAlive: false }, { merge: true })
      // Wait a moment for Firestore to sync
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    // clear day votes
    for (const [uid, p] of Object.entries(freshPlayers)) {
      await setDoc(doc(db, 'rooms', roomId, 'players', uid), { dayVote: null }, { merge: true })
    }
    
    // Get fresh player data again after all updates for accurate win check
    const finalPlayersSnap = await getDocs(collection(db, 'rooms', roomId, 'players'))
    const finalPlayers: Record<string, PlayerDoc> = {}
    finalPlayersSnap.forEach(doc => {
      if (doc.exists()) {
        finalPlayers[doc.id] = doc.data() as PlayerDoc
      }
    })
    
    // win check with fresh data
    const wc = winCheck(finalPlayers)
    if (wc) {
      console.log('resolveDay: Game ended, winner:', wc)
      await updateDoc(doc(db, 'rooms', roomId), { 
        phase: 'ended', 
        status: 'ended',
        winner: wc
      })
    } else {
      // Continue to next round - night phase
      await updateDoc(doc(db, 'rooms', roomId), { phase: 'night_mafia', round: (room.round || 1) + 1 })
    }
  }

  if (!room) {
    console.log('Game: Room not loaded yet')
    return (
      <Card>
        <CardContent>
          <Typography>Loading room data…</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Room ID: {roomId}
          </Typography>
        </CardContent>
      </Card>
    )
  }
  
  if (!myId) {
    return (
      <Card>
        <CardContent>
          <Typography color="error">Error: Not authenticated. Please refresh the page.</Typography>
        </CardContent>
      </Card>
    )
  }
  
  if (!my) {
    return (
      <Card>
        <CardContent>
          <Typography>Loading your player data…</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            If this takes too long, make sure you're in the game room.
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Debug: myId={myId}, players count={Object.keys(players).length}, room phase={room?.phase}
          </Typography>
        </CardContent>
      </Card>
    )
  }
  
  // If role is not assigned yet and game has started, show a message
  if (!my.role && (room.phase === 'night_mafia' || room.phase === 'night_police' || room.phase === 'night_healer' || room.phase === 'day' || room.phase === 'assign_roles')) {
    return (
      <Card>
        <CardContent>
          <Typography color="warning.main">Waiting for roles to be assigned…</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            The host is setting up the game. Please wait a moment and refresh if needed.
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Room phase: {room.phase}, Your role: {my.role || 'not assigned yet'}
          </Typography>
        </CardContent>
      </Card>
    )
  }

  const phaseLabel = 
    room.phase === 'night_mafia' ? '🌙 Night: Mafia Phase' :
    room.phase === 'night_police' ? '🌙 Night: Police Phase' :
    room.phase === 'night_healer' ? '🌙 Night: Healer Phase' :
    room.phase === 'day' ? '☀️ Day Phase' :
    room.phase === 'ended' ? '🏁 Game Ended' : '⏳ Waiting'

  // Show winner announcement if game ended
  if (room.phase === 'ended' && room.winner) {
    return (
      <Card>
        <CardContent>
          <Stack spacing={3} sx={{ textAlign: 'center', py: 2 }}>
            {room.winner === 'town' ? (
              <>
                <Typography variant="h4" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                  🎉🎊🎈🏆🎉🎊🎈
                </Typography>
                <Typography variant="h5" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                  The Village Has Won!
                </Typography>
                <Typography variant="h6" sx={{ color: 'success.dark' }}>
                  Congratulations! 🎊
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  All the Mafia have been eliminated. The villagers, police, and healer have successfully protected the town!
                </Typography>
                <Typography variant="h4" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                  🎉🎊🎈🏆🎉🎊🎈
                </Typography>
              </>
            ) : (
              <>
                <Typography variant="h4" sx={{ color: 'error.main', fontWeight: 'bold' }}>
                  💀🔪🌑💀🔪🌑
                </Typography>
                <Typography variant="h5" sx={{ color: 'error.main', fontWeight: 'bold' }}>
                  The Mafia Has Won!
                </Typography>
                <Typography variant="h6" sx={{ color: 'error.dark' }}>
                  Congratulations! 🎊
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  The Mafia have outnumbered the villagers. The town has fallen under their control!
                </Typography>
                <Typography variant="h4" sx={{ color: 'error.main', fontWeight: 'bold' }}>
                  💀🔪🌑💀🔪🌑
                </Typography>
              </>
            )}
            <Divider />
            <Stack spacing={1}>
              <Typography variant="subtitle2">Final Status:</Typography>
              <Typography variant="body2">
                <strong>Alive ({aliveEntries.length}):</strong> {aliveEntries.map(([id,p])=>p.displayName).join(', ') || 'None'}
              </Typography>
              {deadEntries.length > 0 && (
                <Typography variant="body2" color="text.secondary">
                  <strong>Dead ({deadEntries.length}):</strong> {deadEntries.map(([id,p])=>p.displayName).join(', ')}
                </Typography>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    )
  }

  // Safety check - ensure we have required data
  if (!my || !my.role) {
    console.log('Game: Missing player data - my:', my, 'role:', my?.role)
  }

  console.log('Game: Rendering game screen - phase:', room.phase, 'role:', my?.role)

  const myRoleInfo = getRoleInfo(my.role)

  // Helper function to determine if a player's role should be visible
  // Rules:
  // 1. Game ended - show all roles
  // 2. Lobby/assign_roles phase - don't show roles (roles not assigned yet)
  // 3. Yourself - always show your role (if you have one)
  // 4. If you're Mafia - show other Mafia members' roles
  // 5. Otherwise - hide role (even if dead)
  function shouldShowRole(playerId: string, player: PlayerDoc, myId: string | undefined, myRole: string | undefined, gamePhase: Phase): boolean {
    // Edge case: No player data
    if (!player) return false
    
    // Edge case: Player doesn't have a role assigned yet
    if (!player.role) return false
    
    // Edge case: Lobby or assign_roles phase - roles not assigned yet
    if (gamePhase === 'lobby' || gamePhase === 'assign_roles') return false
    
    // Game ended - show all roles
    if (gamePhase === 'ended') return true
    
    // Edge case: No myId or myRole - can't determine visibility
    if (!myId || !myRole) return false
    
    // Yourself - only show your role if:
    // 1. Game ended (show all roles)
    // 2. Role flash screen hasn't been shown yet (during initial flash)
    // Otherwise, hide your own role too (memory game - prevents peeking)
    if (playerId === myId) {
      // During flash screen, show role
      if (showRoleFlashScreen) return true
      // After flash screen shown, hide it (unless game ended)
      // Note: gamePhase can be 'ended' even though TypeScript doesn't know it
      if ((gamePhase as string) === 'ended') return true
      // Otherwise, hide your own role too
      return false
    }
    
    // If you're Mafia, show other Mafia members
    if (myRole === 'mafia' && player.role === 'mafia') return true
    
    // Otherwise, hide role (even if dead)
    return false
  }

  // Determine if we should show role in header (only during flash screen or game ended)
  // After flash screen is shown, hide role until game ends (memory game)
  const shouldShowRoleInHeader = showRoleFlashScreen || room.phase === 'ended'

  return (
    <>
      {/* Role Flash Screen - Full screen overlay */}
      <Dialog
        open={showRoleFlashScreen}
        maxWidth={false}
        PaperProps={{
          sx: {
            m: 0,
            width: '100%',
            height: '100%',
            maxWidth: '100%',
            maxHeight: '100%',
            borderRadius: 0,
            bgcolor: '#000000',
            background: `linear-gradient(135deg, ${myRoleInfo.color}15 0%, #000000 100%)`,
          },
        }}
        BackdropProps={{
          sx: {
            bgcolor: '#000000',
          },
        }}
      >
        <DialogContent sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          minHeight: '100vh',
          p: 4,
          textAlign: 'center',
        }}>
          <Stack spacing={4} alignItems="center">
            <Typography variant="h3" sx={{ fontWeight: 700, color: 'text.primary', mb: 2 }}>
              Your Role
            </Typography>
            <RoleAvatar role={my.role} size={120} isAlive={my.isAlive} />
            <Box>
              <Chip 
                label={myRoleInfo.name} 
                size="medium"
                sx={{ 
                  bgcolor: `${myRoleInfo.color}30`,
                  color: myRoleInfo.lightColor,
                  border: `2px solid ${myRoleInfo.color}`,
                  fontWeight: 700,
                  fontSize: '1.2rem',
                  py: 3,
                  px: 2,
                  height: 'auto',
                }}
                icon={<span style={{ fontSize: '24px' }}>{myRoleInfo.emoji}</span>}
              />
            </Box>
            <Typography variant="h5" sx={{ color: 'text.secondary', mt: 2 }}>
              {my.displayName}
            </Typography>
            <Typography variant="body1" sx={{ color: 'text.secondary', mt: 4, maxWidth: '400px' }}>
              Remember your role! This will disappear in a moment...
            </Typography>
            <Box sx={{ 
              mt: 4,
              width: '200px',
              height: '4px',
              bgcolor: 'rgba(255, 255, 255, 0.2)',
              borderRadius: 2,
              overflow: 'hidden',
            }}>
              <Box sx={{
                height: '100%',
                width: '100%',
                bgcolor: myRoleInfo.color,
                animation: 'shrink 5s linear forwards',
                '@keyframes shrink': {
                  '0%': { width: '100%' },
                  '100%': { width: '0%' },
                },
              }} />
            </Box>
          </Stack>
        </DialogContent>
      </Dialog>

      <Card sx={{ 
        background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.95) 0%, rgba(30, 30, 30, 0.95) 100%)',
        border: `1px solid ${shouldShowRoleInHeader ? myRoleInfo.color + '40' : 'rgba(255, 255, 255, 0.1)'}`,
        boxShadow: `0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px ${shouldShowRoleInHeader ? myRoleInfo.color + '20' : 'rgba(255, 255, 255, 0.05)'}`,
      }}>
        <CardContent>
          <Stack spacing={3}>
            {/* Header with Avatar */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pb: 2, borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <RoleAvatar role={shouldShowRoleInHeader ? my.role : null} size={64} isAlive={my.isAlive} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                  {my.displayName}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  {shouldShowRoleInHeader ? (
                    <Chip 
                      label={myRoleInfo.name} 
                      size="small" 
                      sx={{ 
                        bgcolor: `${myRoleInfo.color}20`,
                        color: myRoleInfo.lightColor,
                        border: `1px solid ${myRoleInfo.color}40`,
                        fontWeight: 600,
                      }}
                      icon={<span style={{ fontSize: '14px' }}>{myRoleInfo.emoji}</span>}
                    />
                  ) : (
                    <Chip 
                      label="???" 
                      size="small" 
                      sx={{ 
                        bgcolor: 'rgba(163, 163, 163, 0.2)',
                        color: '#a3a3a3',
                        border: '1px solid rgba(163, 163, 163, 0.4)',
                        fontWeight: 600,
                      }}
                    />
                  )}
                  <Chip 
                    label={my.isAlive ? 'Alive' : 'Dead'} 
                    size="small" 
                    sx={{ 
                      bgcolor: my.isAlive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: my.isAlive ? '#34d399' : '#f87171',
                      border: `1px solid ${my.isAlive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                      fontWeight: 500,
                    }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                    Room: {room.code}
                  </Typography>
                </Stack>
              </Box>
            </Box>

          {/* Phase Indicator */}
          <Card sx={{ 
            bgcolor: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            p: 2,
          }}>
            <Typography variant="body1" sx={{ fontWeight: 600, textAlign: 'center' }}>
              {phaseLabel} {room.round > 0 && `• Round ${room.round}`}
            </Typography>
          </Card>
          
          {/* Player Status with Avatars */}
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Players Status</Typography>
            
            {aliveEntries.length > 0 && (
              <Box>
                <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 500, color: 'success.light' }}>
                  Alive ({aliveEntries.length})
                </Typography>
                <Stack spacing={1.5}>
                  {aliveEntries.map(([id, p]) => {
                    const showRole = shouldShowRole(id, p, myId, my.role, room.phase)
                    return (
                      <Box
                        key={id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          p: 1.5,
                          borderRadius: 2,
                          bgcolor: id === myId ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                          border: `1px solid ${id === myId ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.05)'}`,
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            bgcolor: 'rgba(255, 255, 255, 0.05)',
                            transform: 'translateX(4px)',
                          },
                        }}
                      >
                        <RoleAvatar role={showRole ? p.role : null} size={40} isAlive={p.isAlive} />
                        <Typography variant="body2" sx={{ flex: 1, fontWeight: id === myId ? 600 : 400 }}>
                          {p.displayName}
                        </Typography>
                      </Box>
                    )
                  })}
                </Stack>
              </Box>
            )}

            {deadEntries.length > 0 && (
              <Box>
                <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 500, color: 'error.light' }}>
                  Dead ({deadEntries.length})
                </Typography>
                <Stack spacing={1.5}>
                  {deadEntries.map(([id, p]) => {
                    const showRole = shouldShowRole(id, p, myId, my.role, room.phase)
                    return (
                      <Box
                        key={id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          p: 1.5,
                          borderRadius: 2,
                          bgcolor: 'rgba(239, 68, 68, 0.05)',
                          border: '1px solid rgba(239, 68, 68, 0.1)',
                          opacity: 0.7,
                        }}
                      >
                        <RoleAvatar role={showRole ? p.role : null} size={40} isAlive={false} />
                        <Typography variant="body2" sx={{ flex: 1, textDecoration: 'line-through' }}>
                          {p.displayName}
                        </Typography>
                      </Box>
                    )
                  })}
                </Stack>
              </Box>
            )}
          </Stack>
          <Divider />

        {/* Night: Mafia Phase */}
        {room.phase === 'night_mafia' && my.role && (
          <Card sx={{ 
            bgcolor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            p: 2,
          }}>
            <Stack spacing={2}>
              {my.isAlive ? (
                <>
                  {my.role === 'mafia' ? (
                    <>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                        <RoleAvatar role="mafia" size={32} />
                        <Typography variant="h6" sx={{ fontWeight: 600, color: 'error.light' }}>
                          Mafia: Choose your target
                        </Typography>
                      </Box>
                      
                      {/* Mafia Voting Status - Real-time vote display */}
                      {(() => {
                        const aliveMafia = Object.entries(players).filter(([id, p]) => p.role === 'mafia' && p.isAlive)
                        const mafiaVotes: Record<string, string | null> = {}
                        aliveMafia.forEach(([id, p]) => {
                          mafiaVotes[id] = p.nightVote || null
                        })
                        
                        // Calculate vote tally
                        const voteCounts: Record<string, number> = {}
                        Object.values(mafiaVotes).forEach(vote => {
                          if (vote) {
                            voteCounts[vote] = (voteCounts[vote] || 0) + 1
                          }
                        })
                        
                        const mafiaCount = aliveMafia.length
                        const majorityThreshold = Math.floor(mafiaCount / 2) + 1
                        const maxVotes = Math.max(...Object.values(voteCounts), 0)
                        const hasMajority = maxVotes >= majorityThreshold
                        const targetWithMajority = Object.entries(voteCounts).find(([_, count]) => count === maxVotes)?.[0]
                        
                        return (
                          <Card sx={{ 
                            bgcolor: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            mb: 2,
                            p: 2,
                          }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5, color: 'error.light' }}>
                              🔪 Mafia Voting Status ({Object.values(mafiaVotes).filter(v => v !== null).length}/{mafiaCount})
                            </Typography>
                            <Stack spacing={1}>
                              {aliveMafia.map(([id, p]) => {
                                const vote = mafiaVotes[id]
                                const votedPlayer = vote ? players[vote] : null
                                return (
                                  <Box 
                                    key={id}
                                    sx={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: 1,
                                      p: 1,
                                      borderRadius: 1,
                                      bgcolor: id === myId ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                                    }}
                                  >
                                    <Typography variant="body2" sx={{ minWidth: '100px', fontWeight: id === myId ? 600 : 400 }}>
                                      {p.displayName}:
                                    </Typography>
                                    {vote ? (
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                                        <RoleAvatar role={shouldShowRole(vote, votedPlayer || {} as PlayerDoc, myId, my.role, room.phase) ? votedPlayer?.role : null} size={24} />
                                        <Typography variant="body2" sx={{ color: 'text.primary' }}>
                                          {votedPlayer?.displayName || 'Unknown'}
                                        </Typography>
                                      </Box>
                                    ) : (
                                      <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                                        Not voted yet
                                      </Typography>
                                    )}
                                  </Box>
                                )
                              })}
                            </Stack>
                            
                            {/* Vote Tally */}
                            {Object.keys(voteCounts).length > 0 && (
                              <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block', color: 'text.secondary' }}>
                                  Vote Count:
                                </Typography>
                                <Stack spacing={0.5}>
                                  {Object.entries(voteCounts)
                                    .sort(([_, a], [__, b]) => b - a)
                                    .map(([targetId, count]) => {
                                      const targetPlayer = players[targetId]
                                      return (
                                        <Box key={targetId} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <Typography variant="body2">
                                            {targetPlayer?.displayName || 'Unknown'}: {count} vote{count !== 1 ? 's' : ''}
                                          </Typography>
                                          {count === maxVotes && hasMajority && (
                                            <Typography variant="caption" sx={{ color: 'success.light', fontWeight: 600 }}>
                                              ✅ Majority
                                            </Typography>
                                          )}
                                        </Box>
                                      )
                                    })}
                                </Stack>
                                {hasMajority && targetWithMajority && (
                                  <Typography variant="body2" sx={{ mt: 1.5, color: 'success.light', fontWeight: 600 }}>
                                    🎯 Target: {players[targetWithMajority]?.displayName} ({maxVotes}/{mafiaCount} votes)
                                  </Typography>
                                )}
                                {!hasMajority && Object.values(mafiaVotes).filter(v => v !== null).length === mafiaCount && (
                                  <Typography variant="body2" sx={{ mt: 1.5, color: 'warning.light', fontWeight: 600 }}>
                                    ⚠️ Tie detected! Votes will be cleared for re-vote.
                                  </Typography>
                                )}
                              </Box>
                            )}
                          </Card>
                        )
                      })()}
                      
                      <Select
                        fullWidth
                        value={my.nightVote || ''}
                        onChange={(e)=> setMy({...my, nightVote: e.target.value as string})}
                        required
                        sx={{ bgcolor: 'rgba(0, 0, 0, 0.3)' }}
                      >
                        <MenuItem value="" disabled><em>Select a target</em></MenuItem>
                        {aliveEntries.filter(([id])=> id!==auth.currentUser?.uid).map(([id,p])=> {
                          const showRole = shouldShowRole(id, p, myId, my.role, room.phase)
                          return (
                            <MenuItem key={id} value={id}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                                <RoleAvatar role={showRole ? p.role : null} size={28} />
                                <Typography>{p.displayName}</Typography>
                              </Box>
                            </MenuItem>
                          )
                        })}
                      </Select>
                      <Button 
                        variant="contained" 
                        onClick={submitMafia} 
                        disabled={!my.nightVote}
                        sx={{
                          bgcolor: 'error.main',
                          '&:hover': { bgcolor: 'error.dark' },
                          py: 1.5,
                        }}
                      >
                        {my.nightVote ? 'Submit / Change Vote' : 'Submit Target'}
                      </Button>
                    </>
                  ) : (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                      <RoleAvatar role="mafia" size={48} />
                      <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
                        Mafia are choosing their target... Wait for the next phase.
                      </Typography>
                    </Box>
                  )}
                </>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  You are dead. You can observe the game but cannot participate.
                </Typography>
              )}
            </Stack>
          </Card>
        )}

        {/* Night: Police Phase */}
        {room.phase === 'night_police' && my.role && (
          <Card sx={{ 
            bgcolor: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            p: 2,
          }}>
            <Stack spacing={2}>
              {my.isAlive ? (
                <>
                  {my.role === 'police' ? (
                    <>
                      {(() => {
                        // Check if guess is saved in Firestore (more reliable than local state)
                        const savedGuess = players[myId]?.policeGuess
                        const hasSavedGuess = savedGuess !== null && savedGuess !== undefined
                        const guessToShow = savedGuess || my.policeGuess
                        
                        // Only show result if:
                        // 1. We're in night_police phase
                        // 2. We haven't shown it before (hasShownPoliceGuessResult is false) OR we're currently showing it (showPoliceGuessResult is true)
                        // 3. We have a guess to show
                        const shouldShowResult = room.phase === 'night_police' && 
                                                 guessToShow && 
                                                 (showPoliceGuessResult || (!hasShownPoliceGuessResult && isSubmittingPoliceGuess))
                        
                        if (hasSavedGuess && !shouldShowResult) {
                          // Guess already made, but result has been shown - don't show it again (memory game)
                          return (
                            <>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                                <RoleAvatar role="police" size={32} />
                                <Typography variant="h6" sx={{ fontWeight: 600, color: 'info.light' }}>
                                  Police: Guess Submitted
                                </Typography>
                              </Box>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                You have already made your guess. You can only guess once per game.
                              </Typography>
                              <Card sx={{ 
                                mt: 2,
                                p: 2,
                                bgcolor: 'rgba(59, 130, 246, 0.1)',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                textAlign: 'center',
                              }}>
                                <Typography variant="body2" color="text.secondary">
                                  💭 Remember your guess result - it was shown to you earlier!
                                </Typography>
                              </Card>
                            </>
                          )
                        }
                        
                        if (shouldShowResult) {
                          // Show feedback after submission (for 3 seconds)
                          const guessedPlayer = players[guessToShow || '']
                          const isCorrect = guessedPlayer?.role === 'mafia'
                          return (
                            <>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                                <RoleAvatar role="police" size={32} />
                                <Typography variant="h6" sx={{ fontWeight: 600, color: 'info.light' }}>
                                  Police: Your Guess Result
                                </Typography>
                              </Box>
                              {isSubmittingPoliceGuess && !hasSavedGuess && (
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontStyle: 'italic' }}>
                                  Processing your guess...
                                </Typography>
                              )}
                              {guessToShow && (
                                <Card 
                                  sx={{ 
                                    mt: 2,
                                    p: 3,
                                    bgcolor: isCorrect ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                    border: `2px solid ${isCorrect ? '#10b981' : '#ef4444'}`,
                                    textAlign: 'center',
                                    animation: 'pulse 0.5s ease-in-out',
                                    '@keyframes pulse': {
                                      '0%, 100%': { transform: 'scale(1)' },
                                      '50%': { transform: 'scale(1.02)' },
                                    },
                                  }}
                                >
                                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
                                    <RoleAvatar role={shouldShowRole(guessToShow || '', guessedPlayer || {} as PlayerDoc, myId, my.role, room.phase) ? guessedPlayer?.role : null} size={48} />
                                  </Box>
                                  <Typography 
                                    variant="h6" 
                                    sx={{ 
                                      color: isCorrect ? 'success.light' : 'error.light',
                                      fontWeight: 'bold',
                                    }}
                                  >
                                    {isCorrect 
                                      ? '✅ Correct! You guessed right - that player is Mafia!' 
                                      : '❌ Wrong guess. That player is not Mafia.'}
                                  </Typography>
                                  {policeGuessCountdown > 0 && (
                                    <Typography 
                                      variant="h4" 
                                      sx={{ 
                                        mt: 2,
                                        color: isCorrect ? 'success.light' : 'error.light',
                                        fontWeight: 'bold',
                                        fontSize: '3rem',
                                      }}
                                    >
                                      {policeGuessCountdown}
                                    </Typography>
                                  )}
                                  <Typography 
                                    variant="body2" 
                                    sx={{ 
                                      mt: 1,
                                      color: isCorrect ? 'success.light' : 'error.light',
                                    }}
                                  >
                                    Remember this result! It will disappear in a moment...
                                  </Typography>
                                </Card>
                              )}
                            </>
                          )
                        } else {
                          // Show input form
                          return (
                            <>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                                <RoleAvatar role="police" size={32} />
                                <Typography variant="h6" sx={{ fontWeight: 600, color: 'info.light' }}>
                                  Police: Guess who is Mafia
                                </Typography>
                              </Box>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                Make your guess. You can only guess once per game. You'll see if you're correct after submitting.
                              </Typography>
                              <Select
                                fullWidth
                                value={my.policeGuess || ''}
                                onChange={(e)=> setMy({...my, policeGuess: e.target.value as string})}
                                required
                                disabled={isSubmittingPoliceGuess}
                                sx={{ bgcolor: 'rgba(0, 0, 0, 0.3)' }}
                              >
                                <MenuItem value="" disabled><em>Select a player to guess</em></MenuItem>
                                {aliveEntries.filter(([id])=> id!==auth.currentUser?.uid).map(([id,p])=> {
                                  const showRole = shouldShowRole(id, p, myId, my.role, room.phase)
                                  return (
                                    <MenuItem key={id} value={id}>
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                                        <RoleAvatar role={showRole ? p.role : null} size={28} />
                                        <Typography>{p.displayName}</Typography>
                                      </Box>
                                    </MenuItem>
                                  )
                                })}
                              </Select>
                              <Button 
                                variant="contained" 
                                onClick={submitPolice} 
                                disabled={!my.policeGuess || isSubmittingPoliceGuess}
                                fullWidth
                                sx={{
                                  bgcolor: 'info.main',
                                  '&:hover': { bgcolor: 'info.dark' },
                                  py: 1.5,
                                }}
                              >
                                {isSubmittingPoliceGuess ? 'Submitting...' : 'Submit Guess'}
                              </Button>
                            </>
                          )
                        }
                      })()}
                    </>
                  ) : (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                      <RoleAvatar role="police" size={48} />
                      <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
                        Police is making their guess... Wait for the next phase.
                      </Typography>
                    </Box>
                  )}
                </>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  You are dead. You can observe the game but cannot participate.
                </Typography>
              )}
            </Stack>
          </Card>
        )}

        {/* Night: Healer Phase */}
        {room.phase === 'night_healer' && my.role && (
          <Card sx={{ 
            bgcolor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            p: 2,
          }}>
            <Stack spacing={2}>
              {my.isAlive ? (
                <>
                  {my.role === 'healer' ? (
                    <>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                        <RoleAvatar role="healer" size={32} />
                        <Typography variant="h6" sx={{ fontWeight: 600, color: 'success.light' }}>
                          Healer: Choose someone to save
                        </Typography>
                      </Box>
                      <Select
                        fullWidth
                        value={my.healTarget || ''}
                        onChange={(e)=> setMy({...my, healTarget: e.target.value as string})}
                        required
                        sx={{ bgcolor: 'rgba(0, 0, 0, 0.3)' }}
                      >
                        <MenuItem value="" disabled><em>Select someone to heal</em></MenuItem>
                        {aliveEntries.map(([id,p])=> {
                          const showRole = shouldShowRole(id, p, myId, my.role, room.phase)
                          return (
                            <MenuItem key={id} value={id}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                                <RoleAvatar role={showRole ? p.role : null} size={28} />
                                <Typography>{p.displayName}</Typography>
                              </Box>
                            </MenuItem>
                          )
                        })}
                      </Select>
                      <Button 
                        variant="contained" 
                        onClick={submitHealer} 
                        disabled={!my.healTarget}
                        sx={{
                          bgcolor: 'success.main',
                          '&:hover': { bgcolor: 'success.dark' },
                          py: 1.5,
                        }}
                      >
                        Submit Heal
                      </Button>
                    </>
                  ) : (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                      <RoleAvatar role="healer" size={48} />
                      <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
                        Healer is choosing who to save... Wait for the day phase.
                      </Typography>
                    </Box>
                  )}
                </>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  You are dead. You can observe the game but cannot participate.
                </Typography>
              )}
            </Stack>
          </Card>
        )}

        {room.phase === 'day' && my.role && (
          <Stack spacing={2}>
            {/* Show night result */}
            {room.lastNightResult && (
              <Card sx={{ 
                bgcolor: room.lastNightResult.healed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', 
                border: `1px solid ${room.lastNightResult.healed ? '#10b981' : '#ef4444'}`,
                mb: 2,
                p: 3,
              }}>
                {room.lastNightResult.healed ? (
                  <Box sx={{ textAlign: 'center' }}>
                    <RoleAvatar role="healer" size={48} />
                    <Typography variant="h6" sx={{ color: 'success.light', fontWeight: 'bold', mt: 2 }}>
                      🌅 City wakes up with no one dead!
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'success.light', mt: 1 }}>
                      The healer saved {room.lastNightResult.healedPlayer || 'someone'}!
                    </Typography>
                  </Box>
                ) : room.lastNightResult.killed ? (
                  <Box sx={{ textAlign: 'center' }}>
                    {(() => {
                      const killedPlayer = players[room.lastNightResult.killed]
                      const showRole = killedPlayer ? shouldShowRole(room.lastNightResult.killed, killedPlayer, myId, my.role, room.phase) : false
                      return (
                        <>
                          <RoleAvatar role={showRole ? killedPlayer?.role : null} size={48} isAlive={false} />
                          <Typography variant="h6" sx={{ color: 'error.light', fontWeight: 'bold', mt: 2 }}>
                            💀 {killedPlayer?.displayName || 'Someone'} was killed last night!
                          </Typography>
                        </>
                      )
                    })()}
                  </Box>
                ) : null}
              </Card>
            )}
            {my.isAlive ? (
              <>
                {my.role === 'police' && (
                  <Card sx={{ 
                    bgcolor: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    p: 2,
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                      <RoleAvatar role="police" size={32} />
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'info.light' }}>
                        Police: Guess who is Mafia
                      </Typography>
                    </Box>
                    {(() => {
                      const savedGuess = players[myId]?.policeGuess
                      if (savedGuess) {
                        // Police already made a guess - don't show result (memory game)
                        return (
                          <>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                              You have already made your guess during the night phase. Remember the result - it was shown to you earlier!
                            </Typography>
                            <Card sx={{ 
                              mt: 2,
                              p: 2,
                              bgcolor: 'rgba(59, 130, 246, 0.1)',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              textAlign: 'center',
                            }}>
                              <Typography variant="body2" color="text.secondary">
                                💭 Use your memory of the guess result to help the town during discussions!
                              </Typography>
                            </Card>
                          </>
                        )
                      } else {
                        // Police hasn't made a guess yet (shouldn't happen in day phase, but handle it)
                        return (
                          <>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                              Listen to the arguments and make your guess. You'll see if you're correct after submitting (result shown for 3 seconds only).
                            </Typography>
                            <Select
                              fullWidth
                              value={my.policeGuess || ''}
                              onChange={(e)=> setMy({...my, policeGuess: e.target.value as string})}
                              sx={{ bgcolor: 'rgba(0, 0, 0, 0.3)' }}
                            >
                              <MenuItem value=""><em>No guess yet</em></MenuItem>
                              {aliveEntries.filter(([id])=> id!==auth.currentUser?.uid).map(([id,p])=> {
                                const showRole = shouldShowRole(id, p, myId, my.role, room.phase)
                                return (
                                  <MenuItem key={id} value={id}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                                      <RoleAvatar role={showRole ? p.role : null} size={28} />
                                      <Typography>{p.displayName}</Typography>
                                    </Box>
                                  </MenuItem>
                                )
                              })}
                            </Select>
                            {my.policeGuess && (
                              <Button 
                                variant="contained" 
                                onClick={submitPolice} 
                                disabled={!my.policeGuess || isSubmittingPoliceGuess}
                                fullWidth
                                sx={{
                                  bgcolor: 'info.main',
                                  '&:hover': { bgcolor: 'info.dark' },
                                  py: 1.5,
                                  mt: 2,
                                }}
                              >
                                {isSubmittingPoliceGuess ? 'Submitting...' : 'Submit Guess'}
                              </Button>
                            )}
                          </>
                        )
                      }
                    })()}
                  </Card>
                )}
                <Card sx={{ 
                  bgcolor: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  p: 2,
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'warning.light' }}>
                      🗳️ Day Phase: Vote to eliminate a player
                    </Typography>
                  </Box>
                  <Select
                    fullWidth
                    value={my.dayVote || ''}
                    onChange={(e)=> setMy({...my, dayVote: e.target.value as string})}
                    sx={{ bgcolor: 'rgba(0, 0, 0, 0.3)', mb: 2 }}
                  >
                    <MenuItem value=""><em>None</em></MenuItem>
                    {aliveEntries.filter(([id])=> id!==auth.currentUser?.uid).map(([id,p])=> {
                      const showRole = shouldShowRole(id, p, myId, my.role, room.phase)
                      return (
                        <MenuItem key={id} value={id}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                            <RoleAvatar role={showRole ? p.role : null} size={28} />
                            <Typography>{p.displayName}</Typography>
                          </Box>
                        </MenuItem>
                      )
                    })}
                  </Select>
                  <Button 
                    variant="contained" 
                    onClick={submitDay}
                    fullWidth
                    sx={{
                      bgcolor: 'warning.main',
                      '&:hover': { bgcolor: 'warning.dark' },
                      py: 1.5,
                    }}
                  >
                    Submit Vote
                  </Button>
                </Card>
                
                {/* Voting Status Display */}
                {(() => {
                  const alivePlayers = Object.entries(players).filter(([id, p]) => p.isAlive)
                  const votedPlayers = alivePlayers.filter(([id, p]) => p.dayVote !== null && p.dayVote !== undefined)
                  const notVotedPlayers = alivePlayers.filter(([id, p]) => p.dayVote === null || p.dayVote === undefined)
                  
                  return (
                    <Card sx={{ mt: 2, bgcolor: 'background.paper' }}>
                      <CardContent>
                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                          📊 Voting Status ({votedPlayers.length}/{alivePlayers.length})
                        </Typography>
                        <Stack spacing={1}>
                          {votedPlayers.length > 0 && (
                            <Typography variant="body2" sx={{ color: 'success.main' }}>
                              <strong>✅ Voted ({votedPlayers.length}):</strong> {votedPlayers.map(([id, p]) => p.displayName).join(', ')}
                            </Typography>
                          )}
                          {notVotedPlayers.length > 0 && (
                            <Typography variant="body2" sx={{ color: 'warning.main' }}>
                              <strong>⏳ Not Voted Yet ({notVotedPlayers.length}):</strong> {notVotedPlayers.map(([id, p]) => p.displayName).join(', ')}
                            </Typography>
                          )}
                          {votedPlayers.length === alivePlayers.length && alivePlayers.length > 0 && (
                            <Typography variant="body2" sx={{ color: 'info.main', fontStyle: 'italic', mt: 1 }}>
                              All votes submitted. Resolving phase...
                            </Typography>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  )
                })()}
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                You are dead. You can observe the discussion but cannot vote.
              </Typography>
            )}
          </Stack>
        )}

        {room.phase === 'lobby' && (
          <Typography variant="body2" color="text.secondary">
            Waiting to start… The game hasn't begun yet.
          </Typography>
        )}

        {room.phase === 'ended' && (
          <Stack spacing={3}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                🏁 Game Ended
              </Typography>
              {room.winner && (
                <Typography variant="h6" sx={{ 
                  color: room.winner === 'mafia' ? 'error.light' : 'success.light',
                  fontWeight: 600,
                  mb: 2,
                }}>
                  {room.winner === 'mafia' ? '🔪 Mafia Wins!' : '🏆 Villagers Win!'}
                </Typography>
              )}
            </Box>
            <Divider />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Final Player Status:</Typography>
            <Stack spacing={1}>
              {allPlayerEntries.map(([id, p]) => {
                const showRole = shouldShowRole(id, p, myId, my?.role, room.phase)
                return (
                  <Box 
                    key={id} 
                    sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 1.5,
                      p: 1.5,
                      bgcolor: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: 1,
                    }}
                  >
                    <RoleAvatar role={showRole ? p.role : null} size={32} isAlive={p.isAlive} />
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      {p.displayName}
                    </Typography>
                    {showRole && p.role && (
                      <Chip 
                        label={getRoleInfo(p.role).name} 
                        size="small"
                        sx={{ 
                          bgcolor: `${getRoleInfo(p.role).color}20`,
                          color: getRoleInfo(p.role).lightColor,
                          border: `1px solid ${getRoleInfo(p.role).color}40`,
                        }}
                      />
                    )}
                    <Chip 
                      label={p.isAlive ? 'Alive' : 'Dead'} 
                      size="small"
                      sx={{ 
                        bgcolor: p.isAlive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: p.isAlive ? '#34d399' : '#f87171',
                      }}
                    />
                  </Box>
                )
              })}
            </Stack>
            <Divider />
            {room?.createdBy === auth.currentUser?.uid && (
              <Button
                variant="contained"
                size="large"
                fullWidth
                onClick={async () => {
                  try {
                    // Generate new room code
                    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
                    let newCode = ''
                    for (let i = 0; i < 6; i++) {
                      newCode += chars[Math.floor(Math.random() * chars.length)]
                    }
                    
                    // Reset all player data
                    const playersSnap = await getDocs(collection(db, 'rooms', roomId, 'players'))
                    for (const playerDoc of playersSnap.docs) {
                      await setDoc(playerDoc.ref, {
                        role: null,
                        isAlive: true,
                        nightVote: null,
                        healTarget: null,
                        dayVote: null,
                        policeGuess: null,
                      }, { merge: true })
                    }
                    
                    // Reset room state
                    await updateDoc(doc(db, 'rooms', roomId), {
                      code: newCode,
                      phase: 'lobby',
                      status: 'open',
                      round: 0,
                      winner: null,
                      lastNightResult: null,
                    })
                    
                    showNotification(`New game ready! Room code: ${newCode}`, 'success')
                  } catch (error: any) {
                    console.error('Error resetting game:', error)
                    showNotification('Failed to start new game: ' + (error.message || 'Unknown error'), 'error')
                  }
                }}
                sx={{
                  background: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  py: 2,
                  fontSize: '1.1rem',
                  animation: 'flicker 1.5s ease-in-out infinite',
                  '@keyframes flicker': {
                    '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                    '50%': { opacity: 0.8, transform: 'scale(1.02)' },
                  },
                  '&:hover': {
                    background: 'linear-gradient(135deg, #4f46e5 0%, #db2777 100%)',
                    animation: 'none',
                  },
                }}
              >
                🎮 Play Again
              </Button>
            )}
            {room?.createdBy !== auth.currentUser?.uid && (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ 
                  animation: 'flicker 1.5s ease-in-out infinite',
                  '@keyframes flicker': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.6 },
                  },
                }}>
                  ⏳ Waiting for host to start a new game...
                </Typography>
              </Box>
            )}
          </Stack>
        )}
        </Stack>
      </CardContent>
    </Card>
    </>
  )
}
