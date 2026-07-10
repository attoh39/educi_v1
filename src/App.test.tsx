import { render, screen } from '@testing-library/react';
import App from './App';

it('affiche EduCI', () => {
  render(<App />);
  expect(screen.getByText('EduCI')).toBeInTheDocument();
});
