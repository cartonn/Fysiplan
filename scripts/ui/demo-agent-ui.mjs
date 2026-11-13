import '@ui-sdk/web/tabs';
import '@ui-sdk/web/dialog';
import '@ui-sdk/web/textarea';
import { createAgent, registerTools } from '@ui-sdk/web/agent';
import { demoActieToegestaan } from './demo-agent-policy.mjs';

let actief = false;
const allow = step => demoActieToegestaan(step, actief);
const agent = createAgent({ allow });

export function mount(root) {
  actief = true;
  const unregister = registerTools(agent, { allow });
  const waiting = root.querySelector('[data-demo-taken="wacht"]');
  const ongoing = root.querySelector('[data-demo-taken="lopend"]');
  if (waiting && ongoing) {
    const tabs = document.createElement('ui-tabs');
    tabs.setAttribute('aria-label', 'Demotaken');
    tabs.setAttribute('default-value', 'wacht');
    tabs.className = 'demo-sdk-taken';
    tabs.innerHTML = '<ui-tabs-list aria-label="Demotaken"><ui-tabs-tab value="wacht"><button type="button" class="knop licht">Wacht op jou</button></ui-tabs-tab><ui-tabs-tab value="lopend"><button type="button" class="knop licht">Lopend en afgerond</button></ui-tabs-tab></ui-tabs-list><ui-tabs-panel value="wacht"></ui-tabs-panel><ui-tabs-panel value="lopend"></ui-tabs-panel>';
    waiting.before(tabs);
    tabs.querySelector('[value="wacht"][role="tabpanel"], ui-tabs-panel[value="wacht"]').append(waiting);
    tabs.querySelector('ui-tabs-panel[value="lopend"]').append(ongoing);
  }
  root.querySelectorAll('[data-demo-concept] details.mail').forEach(details => {
    const card = details.closest('[data-demo-concept]');
    const title = card.querySelector('.zaakkop b').textContent;
    const dialog = document.createElement('ui-dialog');
    dialog.setAttribute('aria-label', 'Democoncept: ' + title);
    dialog.innerHTML = '<ui-dialog-trigger><button type="button" class="knop licht klein">Lees het concept</button></ui-dialog-trigger><ui-dialog-backdrop hidden class="demo-sdk-backdrop"></ui-dialog-backdrop><ui-dialog-content hidden class="demo-sdk-concept"><ui-dialog-title></ui-dialog-title><ui-dialog-description>Concept ter beoordeling. Er wordt niets verstuurd.</ui-dialog-description><pre></pre><ui-dialog-close><button type="button" class="knop">Sluiten</button></ui-dialog-close></ui-dialog-content>';
    dialog.querySelector('ui-dialog-title').textContent = 'Democoncept: ' + title;
    dialog.querySelector('pre').textContent = details.querySelector('pre').textContent;
    details.replaceWith(dialog);
  });
  const enhanceFeedback = () => root.querySelectorAll('[data-demo-concept] .redenvorm textarea:not([data-sdk])').forEach(field => {
    field.dataset.sdk = 'true';
    field.setAttribute('aria-label', 'Feedback op democoncept');
    const wrapper = document.createElement('ui-textarea');
    wrapper.setAttribute('aria-label', 'Feedback op democoncept');
    field.before(wrapper);
    wrapper.append(field);
  });
  const observer = new MutationObserver(enhanceFeedback);
  observer.observe(root, { childList: true, subtree: true });
  enhanceFeedback();
  return () => { actief = false; observer.disconnect(); unregister(); };
}
