// localStorage utilities for room persistence

const STORAGE_KEYS = {
  ROOM_ID: 'mafia_roomId',
  DISPLAY_NAME: 'mafia_displayName',
  ROOM_CODE: 'mafia_roomCode'
} as const

export interface SavedRoomData {
  roomId: string
  displayName: string
  roomCode?: string
}

export function saveRoomData(roomId: string, displayName: string, roomCode?: string) {
  try {
    localStorage.setItem(STORAGE_KEYS.ROOM_ID, roomId)
    localStorage.setItem(STORAGE_KEYS.DISPLAY_NAME, displayName)
    if (roomCode) {
      localStorage.setItem(STORAGE_KEYS.ROOM_CODE, roomCode)
    }
    console.log('Saved room data to localStorage:', { roomId, displayName, roomCode })
  } catch (error) {
    console.error('Error saving room data to localStorage:', error)
  }
}

export function getSavedRoomData(): SavedRoomData | null {
  try {
    const roomId = localStorage.getItem(STORAGE_KEYS.ROOM_ID)
    const displayName = localStorage.getItem(STORAGE_KEYS.DISPLAY_NAME)
    const roomCode = localStorage.getItem(STORAGE_KEYS.ROOM_CODE) || undefined
    
    if (roomId && displayName) {
      return { roomId, displayName, roomCode }
    }
    return null
  } catch (error) {
    console.error('Error reading room data from localStorage:', error)
    return null
  }
}

export function clearRoomData() {
  try {
    localStorage.removeItem(STORAGE_KEYS.ROOM_ID)
    localStorage.removeItem(STORAGE_KEYS.DISPLAY_NAME)
    localStorage.removeItem(STORAGE_KEYS.ROOM_CODE)
    console.log('Cleared room data from localStorage')
  } catch (error) {
    console.error('Error clearing room data from localStorage:', error)
  }
}

