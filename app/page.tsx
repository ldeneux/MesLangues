import LanguageHub from './components/LanguageHub';
import { ProfileProvider } from './components/ProfileContext';

export const revalidate = 0;
// Les étapes de génération de pack (texte + audio, par lots de ~20 phrases)
// peuvent prendre plus que les 10s par défaut d'une server action.
export const maxDuration = 60;

export default function Home() {
  return (
    <main className="page">
      <ProfileProvider>
        <LanguageHub />
      </ProfileProvider>
    </main>
  );
}
