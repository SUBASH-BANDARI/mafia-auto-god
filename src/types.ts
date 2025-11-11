export type Phase = 'lobby' | 'assign_roles' | 'night_mafia' | 'night_police' | 'night_healer' | 'day' | 'ended';

export interface Room {
  code: string;
  createdBy: string;
  createdAt: number;
  phase: Phase;
  status: 'open'|'in_progress'|'ended';
  round: number;
  winner?: 'town'|'mafia';
  lastNightResult?: {
    killed?: string;
    healed?: boolean;
    healedPlayer?: string;
  };
  counts?: {
    total: number;
    alive: number;
    mafiaAlive: number;
  };
}

export interface PlayerDoc {
  displayName: string;
  isAlive: boolean;
  role?: 'mafia'|'villager'|'police'|'healer';
  nightVote?: string|null;   // mafia target (if mafia)
  healTarget?: string|null;  // healer target
  dayVote?: string|null;     // day vote
  policeGuess?: string|null; // police guess of who is mafia (if police)
}
