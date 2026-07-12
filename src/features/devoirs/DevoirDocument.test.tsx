import { render, screen } from '@testing-library/react';
import { DevoirDocument } from './DevoirDocument';
import type { Devoir } from './schema';

const devoir: Devoir = {
  matieres: [
    {
      nom: 'Français',
      exercices: [
        { numero: 1, consigne: 'Lis les syllabes.', type: 'ecriture', items: ['MA', 'ME'], espaceReponse: 'lignes' },
      ],
    },
  ],
};

it('affiche l’entête avec le nom de l’élève et la classe', () => {
  render(<DevoirDocument devoir={devoir} eleve="Lamine Kouassi" classe="CP1" date="10/07/2026" />);
  expect(screen.getByText('Lamine Kouassi')).toBeInTheDocument();
  expect(screen.getByText('CP1')).toBeInTheDocument();
});

it('affiche les matières, consignes et items', () => {
  render(<DevoirDocument devoir={devoir} eleve="L K" classe="CP1" date="10/07/2026" />);
  expect(screen.getByText('Français')).toBeInTheDocument();
  expect(screen.getByText(/Lis les syllabes\./)).toBeInTheDocument();
  expect(screen.getByText('MA')).toBeInTheDocument();
});

it('affiche le libellé de classe connu', () => {
  render(<DevoirDocument devoir={devoir} eleve="L K" classe="6EME" date="10/07/2026" />);
  expect(screen.getByText('6ème')).toBeInTheDocument(); // classeLabel('6EME')
});

it('en mode secondaire affiche Contrôle, le barème /20 et les points par exercice', () => {
  const controle: Devoir = {
    matieres: [{
      nom: 'Mathématiques',
      exercices: [
        { numero: 1, consigne: 'Calcule.', type: 'calcul', items: [], espaceReponse: 'cadre', points: 12 },
        { numero: 2, consigne: 'Résous.', type: 'calcul', items: [], espaceReponse: 'cadre', points: 8 },
      ],
    }],
  };
  render(<DevoirDocument devoir={controle} eleve="L K" classe="6EME" date="12/07/2026" variante="secondaire" />);
  expect(screen.getByText('Contrôle')).toBeInTheDocument();
  expect(screen.getByText(/Noté sur 20/)).toBeInTheDocument();
  expect(screen.getByText(/12 pts/)).toBeInTheDocument();
});
