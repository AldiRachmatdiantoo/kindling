import type { AINote } from '../../api/types';

/** Why the user got a simpler, template answer instead of the AI one. Empty when the AI answered. */
export function aiNoteText(note: AINote | undefined): string {
  switch (note) {
    case 'daily_limit':
      return "You've used today's AI help, so here's a simpler version. It resets at midnight.";
    case 'unavailable':
      return 'The AI is taking a short break, so here is a simpler version for now.';
    default:
      return '';
  }
}
