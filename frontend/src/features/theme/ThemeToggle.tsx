import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { getTheme, setTheme, type Theme } from './theme';
import { Button } from '@/components/watermelon-ui/button';

/** Switches light/dark. The label names the theme it switches to, not the current one. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={() => {
        setTheme(next);
        setThemeState(next);
      }}
      aria-label={next === 'dark' ? 'Switch to dark mode' : 'Switch to light mode'}
      title={next === 'dark' ? 'Dark mode' : 'Light mode'}
      data-testid="theme-toggle"
      className={className}
    >
      {next === 'dark' ? (
        <Moon className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Sun className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}
