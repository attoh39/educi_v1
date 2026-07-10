import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CLASSES, anneeScolaire, classeLabel, matieresParDefaut,
} from '../../domain/classes';
import { fr } from '../../i18n/fr';
import { creerEnfant } from './api';
import { enfantSchema, type EnfantFormValues } from './schema';

const champ = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base';
const etiquette = 'block text-sm font-medium text-slate-700';

export function NewChildPage() {
  const navigate = useNavigate();
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);
  const {
    register, handleSubmit, control, setValue, watch,
    formState: { errors, isSubmitting },
  } = useForm<EnfantFormValues>({
    resolver: zodResolver(enfantSchema),
    defaultValues: {
      nom: '', prenoms: '', dateNaissance: '', sexe: 'M',
      classe: 'CP1', etablissement: '', systeme: 'IVOIRIEN',
      matieres: matieresParDefaut('CP1'),
    },
  });
  const classe = watch('classe');

  async function onSubmit(valeurs: EnfantFormValues) {
    setErreurServeur(null);
    try {
      await creerEnfant(valeurs, anneeScolaire(new Date()));
      navigate('/enfants');
    } catch {
      setErreurServeur(fr.commun.erreurInconnue);
    }
  }

  return (
    <section>
      <h2 className="text-xl font-bold text-slate-800">{fr.enfants.ajouter}</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4" noValidate>
        <label className={etiquette}>{fr.enfants.nom}
          <input {...register('nom')} className={champ} />
          {errors.nom && <p role="alert" className="mt-1 text-sm text-red-600">{errors.nom.message}</p>}
        </label>
        <label className={etiquette}>{fr.enfants.prenoms}
          <input {...register('prenoms')} className={champ} />
          {errors.prenoms && <p role="alert" className="mt-1 text-sm text-red-600">{errors.prenoms.message}</p>}
        </label>
        <label className={etiquette}>{fr.enfants.dateNaissance}
          <input type="date" {...register('dateNaissance')} className={champ} />
          {errors.dateNaissance && <p role="alert" className="mt-1 text-sm text-red-600">{errors.dateNaissance.message}</p>}
        </label>
        <label className={etiquette}>{fr.enfants.sexe}
          <select {...register('sexe')} className={champ}>
            <option value="M">{fr.enfants.garcon}</option>
            <option value="F">{fr.enfants.fille}</option>
          </select>
        </label>
        <label className={etiquette}>{fr.enfants.classe}
          <select
            {...register('classe', {
              onChange: (e) => setValue('matieres', matieresParDefaut(e.target.value)),
            })}
            className={champ}
          >
            {CLASSES.map((c) => (
              <option key={c} value={c}>{classeLabel(c)}</option>
            ))}
          </select>
        </label>
        <label className={etiquette}>{fr.enfants.etablissement}
          <input {...register('etablissement')} className={champ} />
          {errors.etablissement && <p role="alert" className="mt-1 text-sm text-red-600">{errors.etablissement.message}</p>}
        </label>
        <label className={etiquette}>{fr.enfants.systeme}
          <select {...register('systeme')} className={champ}>
            {(['IVOIRIEN', 'FRANCAIS', 'AUTRE'] as const).map((s) => (
              <option key={s} value={s}>{fr.enfants.systemes[s]}</option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className={etiquette}>{fr.enfants.matieres}</legend>
          <Controller
            control={control}
            name="matieres"
            render={({ field }) => (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {matieresParDefaut(classe).map((m) => (
                  <label key={m} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={field.value.includes(m)}
                      onChange={(e) =>
                        field.onChange(
                          e.target.checked
                            ? [...field.value, m]
                            : field.value.filter((v) => v !== m),
                        )
                      }
                    />
                    {m}
                  </label>
                ))}
              </div>
            )}
          />
          {errors.matieres && <p role="alert" className="mt-1 text-sm text-red-600">{errors.matieres.message}</p>}
        </fieldset>

        {erreurServeur && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreurServeur}</p>
        )}

        <button type="submit" disabled={isSubmitting}
          className="w-full rounded-lg bg-teal-600 py-3 font-semibold text-white disabled:opacity-50">
          {fr.commun.enregistrer}
        </button>
      </form>
    </section>
  );
}
