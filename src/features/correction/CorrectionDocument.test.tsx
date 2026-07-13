import { render, screen } from '@testing-library/react';
import { CorrectionDocument } from './CorrectionDocument';
import type { Correction } from './schema';

const correction: Correction = {
  note: 15,
  appreciation: 'Bon travail.',
  details: [
    { matiere: 'Français', numero: 1, statut: 'reussi', explication: 'Bien lu.', bonneReponse: 'MA' },
    { matiere: 'Français', numero: 2, statut: 'a_revoir', explication: 'Revois la syllabe.', bonneReponse: 'ME' },
  ],
};

it('affiche la note, l’appréciation et le feedback par exercice', () => {
  render(<CorrectionDocument correction={correction} />);
  expect(screen.getByText(/15/)).toBeInTheDocument();
  expect(screen.getByText('Bon travail.')).toBeInTheDocument();
  expect(screen.getByText('Réussi')).toBeInTheDocument();
  expect(screen.getByText('À revoir')).toBeInTheDocument();
  expect(screen.getByText(/Revois la syllabe\./)).toBeInTheDocument();
});

it('sans note (primaire) affiche seulement l’appréciation', () => {
  render(<CorrectionDocument correction={{ ...correction, note: undefined }} />);
  expect(screen.queryByText('Note')).not.toBeInTheDocument();
  expect(screen.getByText('Bon travail.')).toBeInTheDocument();
});
