// Only local presentation actions. Decisions and requests remain human actions.
export function demoActieToegestaan(step, actief) {
  if (!actief || step.confirm) return false;
  const { component, label, action, args = [] } = step;
  if (component === 'tabs' && label === 'Demotaken') {
    return action === 'setValue' && ['wacht', 'lopend'].includes(args[0]);
  }
  if (component === 'dialog' && label?.startsWith('Democoncept: ')) {
    return action === 'setOpen' && args.length === 1 && typeof args[0] === 'boolean';
  }
  if (['input', 'textarea'].includes(component) && label === 'Feedback op democoncept') {
    return action === 'clear' || (action === 'setValue' && typeof args[0] === 'string' && args[0].length <= 200);
  }
  return false;
}
