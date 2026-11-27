import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, MotionConfig } from 'motion/react';
import { App } from './App';
import './index.css';

const loadMotionFeatures = () => import('./lib/motion-features').then((m) => m.default);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* reducedMotion="user": springs and slides turn into instant changes when the OS asks. */}
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </LazyMotion>
  </StrictMode>,
);
