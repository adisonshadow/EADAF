import type { XAgentCommand_v0_9 } from '@ant-design/x-card';
import { NEXT_STEP_CATALOG_ID, NEXT_STEP_SURFACE_ID } from './nextStepCatalog';
import type { NextStepItem } from './parseA2uiCommands';

export function buildNextStepCommands(steps: NextStepItem[]): XAgentCommand_v0_9[] {
  if (!steps.length) return [];

  const buttonIds = steps.map((_, index) => `btn-${index}`);
  const components: Array<Record<string, unknown>> = [
    {
      id: 'root',
      component: 'Column',
      children: ['title', 'actions'],
      gap: 8,
    },
    {
      id: 'title',
      component: 'Text',
      text: '下一步建议 ✨',
      variant: 'caption',
    },
    {
      id: 'actions',
      component: 'Column',
      children: buttonIds,
      gap: 6,
    },
  ];

  steps.forEach((step, index) => {
    components.push({
      id: buttonIds[index]!,
      component: 'Button',
      text: step.label,
      action: {
        event: {
          name: step.id,
          context: {
            label: { value: step.label },
          },
        },
      },
    });
  });

  return [
    {
      version: 'v0.9',
      createSurface: {
        surfaceId: NEXT_STEP_SURFACE_ID,
        catalogId: NEXT_STEP_CATALOG_ID,
      },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: NEXT_STEP_SURFACE_ID,
        components,
      },
    },
  ];
}
