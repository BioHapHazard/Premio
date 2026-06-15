// a11y: lets a non-<button> element (role="button" tabIndex={0}) be activated by
// keyboard. Mirrors native button behavior — Enter and Space fire the handler.
export const keyActivate = (handler) => (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(e); }
};
