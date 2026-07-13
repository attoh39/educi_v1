export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      children: {
        Row: {
          created_at: string
          date_naissance: string
          id: string
          nom: string
          parent_id: string
          photo_path: string | null
          prenoms: string
          sexe: string
        }
        Insert: {
          created_at?: string
          date_naissance: string
          id?: string
          nom: string
          parent_id: string
          photo_path?: string | null
          prenoms: string
          sexe: string
        }
        Update: {
          created_at?: string
          date_naissance?: string
          id?: string
          nom?: string
          parent_id?: string
          photo_path?: string | null
          prenoms?: string
          sexe?: string
        }
        Relationships: [
          {
            foreignKeyName: "children_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          annee_scolaire: string
          child_id: string
          classe: Database["public"]["Enums"]["classe_niveau"]
          created_at: string
          etablissement: string
          id: string
          is_active: boolean
          matieres: string[]
          parent_id: string
          systeme: Database["public"]["Enums"]["systeme_educatif"]
        }
        Insert: {
          annee_scolaire: string
          child_id: string
          classe: Database["public"]["Enums"]["classe_niveau"]
          created_at?: string
          etablissement?: string
          id?: string
          is_active?: boolean
          matieres?: string[]
          parent_id: string
          systeme?: Database["public"]["Enums"]["systeme_educatif"]
        }
        Update: {
          annee_scolaire?: string
          child_id?: string
          classe?: Database["public"]["Enums"]["classe_niveau"]
          created_at?: string
          etablissement?: string
          id?: string
          is_active?: boolean
          matieres?: string[]
          parent_id?: string
          systeme?: Database["public"]["Enums"]["systeme_educatif"]
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_requests: {
        Row: {
          child_id: string
          contenu: Json
          created_at: string
          enrollment_id: string
          erreur: string | null
          id: string
          mode: string
          parent_id: string
          statut: Database["public"]["Enums"]["homework_statut"]
        }
        Insert: {
          child_id: string
          contenu: Json
          created_at?: string
          enrollment_id: string
          erreur?: string | null
          id?: string
          mode: string
          parent_id: string
          statut?: Database["public"]["Enums"]["homework_statut"]
        }
        Update: {
          child_id?: string
          contenu?: Json
          created_at?: string
          enrollment_id?: string
          erreur?: string | null
          id?: string
          mode?: string
          parent_id?: string
          statut?: Database["public"]["Enums"]["homework_statut"]
        }
        Relationships: [
          {
            foreignKeyName: "homework_requests_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_requests_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_requests_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      homeworks: {
        Row: {
          child_id: string
          corrige: Json
          cout_tokens_entree: number
          cout_tokens_sortie: number
          created_at: string
          enrollment_id: string
          exercices: Json
          id: string
          modele: string
          parent_id: string
          profil: string
          prompt_version: string
          request_id: string
        }
        Insert: {
          child_id: string
          corrige: Json
          cout_tokens_entree?: number
          cout_tokens_sortie?: number
          created_at?: string
          enrollment_id: string
          exercices: Json
          id?: string
          modele: string
          parent_id: string
          profil: string
          prompt_version: string
          request_id: string
        }
        Update: {
          child_id?: string
          corrige?: Json
          cout_tokens_entree?: number
          cout_tokens_sortie?: number
          created_at?: string
          enrollment_id?: string
          exercices?: Json
          id?: string
          modele?: string
          parent_id?: string
          profil?: string
          prompt_version?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "homeworks_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homeworks_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homeworks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homeworks_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "homework_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      parents: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          child_id: string
          created_at: string
          erreur: string | null
          homework_id: string
          id: string
          parent_id: string
          photo_paths: string[]
          statut: Database["public"]["Enums"]["submission_statut"]
        }
        Insert: {
          child_id: string
          created_at?: string
          erreur?: string | null
          homework_id: string
          id?: string
          parent_id: string
          photo_paths?: string[]
          statut?: Database["public"]["Enums"]["submission_statut"]
        }
        Update: {
          child_id?: string
          created_at?: string
          erreur?: string | null
          homework_id?: string
          id?: string
          parent_id?: string
          photo_paths?: string[]
          statut?: Database["public"]["Enums"]["submission_statut"]
        }
        Relationships: [
          {
            foreignKeyName: "submissions_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homeworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_quotas: {
        Row: {
          child_id: string
          generations: number
          id: string
          parent_id: string
          semaine_iso: string
        }
        Insert: {
          child_id: string
          generations?: number
          id?: string
          parent_id: string
          semaine_iso: string
        }
        Update: {
          child_id?: string
          generations?: number
          id?: string
          parent_id?: string
          semaine_iso?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_quotas_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_quotas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_child_with_enrollment: {
        Args: {
          p_annee_scolaire: string
          p_classe: Database["public"]["Enums"]["classe_niveau"]
          p_date_naissance: string
          p_etablissement: string
          p_matieres: string[]
          p_nom: string
          p_prenoms: string
          p_sexe: string
          p_systeme: Database["public"]["Enums"]["systeme_educatif"]
        }
        Returns: string
      }
      incrementer_quota: {
        Args: { p_child_id: string; p_semaine_iso: string }
        Returns: number
      }
    }
    Enums: {
      classe_niveau:
        | "PS"
        | "MS"
        | "GS"
        | "CP1"
        | "CP2"
        | "CE1"
        | "CE2"
        | "CM1"
        | "CM2"
        | "6EME"
        | "5EME"
        | "4EME"
        | "3EME"
        | "SECONDE"
        | "PREMIERE"
        | "TERMINALE"
      homework_statut: "en_attente" | "generation" | "pret" | "echec"
      submission_statut: "envoye" | "correction" | "corrige" | "echec"
      systeme_educatif: "IVOIRIEN" | "FRANCAIS" | "AUTRE"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      classe_niveau: [
        "PS",
        "MS",
        "GS",
        "CP1",
        "CP2",
        "CE1",
        "CE2",
        "CM1",
        "CM2",
        "6EME",
        "5EME",
        "4EME",
        "3EME",
        "SECONDE",
        "PREMIERE",
        "TERMINALE",
      ],
      homework_statut: ["en_attente", "generation", "pret", "echec"],
      submission_statut: ["envoye", "correction", "corrige", "echec"],
      systeme_educatif: ["IVOIRIEN", "FRANCAIS", "AUTRE"],
    },
  },
} as const

