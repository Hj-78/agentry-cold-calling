export interface SessionAppel {
  id: number
  ordre: number
  agenceId?: number | null
  agenceNom?: string | null
  agenceTel?: string | null
  resultat?: string | null
  resume?: string | null
  pointsCles?: string | null
  prochaineAction?: string | null
  transcription?: string | null
  duree?: number | null
  aPitche?: boolean | null
  rdvPris?: boolean | null
  rdvDate?: string | null
  rdvHeure?: string | null
  agenceEmail?: string | null
  noteRapide?: string | null
  createdAt: string
}

export interface AgenceQueue {
  id: number
  nom: string
  telephone: string | null
  email: string | null
  ville: string | null
  adresse: string | null
}

export interface Session {
  id: number
  date: string
  duree?: number | null
  status: string
  totalAppels: number
  objectif: number
  dureeObjectif?: number | null
  resume?: string | null
  agenceQueue?: AgenceQueue[] | null
  createdAt: string
  appels: SessionAppel[]
}
