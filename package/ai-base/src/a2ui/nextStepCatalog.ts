import { registerCatalog, type Catalog } from '@ant-design/x-card';

export const NEXT_STEP_CATALOG_ID = 'eadaf://next-step/v1';

export const NEXT_STEP_SURFACE_ID = 'eadaf-next-steps';

let registered = false;

export const nextStepCatalog: Catalog = {
  catalogId: NEXT_STEP_CATALOG_ID,
  components: {
    Column: {
      type: 'object',
      properties: {
        children: { type: 'array', items: { type: 'string' } },
        gap: { type: 'number' },
      },
    },
    Text: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        variant: { type: 'string' },
      },
      required: ['text'],
    },
    Button: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        action: { type: 'object' },
      },
      required: ['text'],
    },
  },
};

export function ensureNextStepCatalogRegistered() {
  if (registered) return;
  registerCatalog(nextStepCatalog);
  registered = true;
}
