import { Button } from 'antd';
import { XCard, type ActionPayload } from '@ant-design/x-card';
import type { XAgentCommand_v0_9 } from '@ant-design/x-card';
import { useMemo, type ReactNode } from 'react';
import { buildNextStepCommands } from './buildNextStepCommands';
import { ArrowRightOutlined } from '@ant-design/icons';
import { ensureNextStepCatalogRegistered, NEXT_STEP_SURFACE_ID } from './nextStepCatalog';
import type { NextStepItem } from './parseA2uiCommands';
import './NextStepA2uiDeck.css';

ensureNextStepCatalogRegistered();

const TextBlock = ({ text, variant }: { text: string; variant?: string }) => {
  if (variant === 'caption') {
    return (
      <div className="eadaf-next-step-title">{text}</div>
    );
  }
  return <p>{text}</p>;
};

const ActionButton = ({
  text,
  onAction,
  action,
}: {
  text: string;
  onAction?: (payload: ActionPayload) => void;
  action?: { event?: { name?: string; context?: Record<string, unknown> } };
}) => (
  <Button
    size="small"
    color="default" 
    variant="filled"
    className="eadaf-next-step-btn"
    onClick={() => {
      if (!onAction || !action?.event?.name) return;
      onAction({
        name: action.event.name,
        surfaceId: NEXT_STEP_SURFACE_ID,
        context: action.event.context ?? {},
      });
    }}
  >
    {text}
    <ArrowRightOutlined className="eadaf-next-step-btn-icon" />
  </Button>
);

const ColumnBlock = ({
  children,
  gap,
}: {
  children?: React.ReactNode;
  gap?: number;
}) => (
  <div className="eadaf-next-step-column" style={{ gap: gap ?? 8 }}>
    {children}
  </div>
);

const UI_COMPONENTS = {
  Text: TextBlock,
  Button: ActionButton,
  Column: ColumnBlock,
};

interface NextStepA2uiDeckProps {
  steps: NextStepItem[];
  onAction: (payload: ActionPayload) => void;
}

export default function NextStepA2uiDeck({ steps, onAction }: NextStepA2uiDeckProps) {
  const commands = useMemo(
    () => buildNextStepCommands(steps) as XAgentCommand_v0_9[],
    [steps],
  );

  if (!commands.length) return null;

  return (
    <div className="eadaf-next-step-deck">
      <XCard.Box commands={commands} components={UI_COMPONENTS} onAction={onAction}>
        <XCard.Card id={NEXT_STEP_SURFACE_ID} />
      </XCard.Box>
    </div>
  );
}

export function NextStepStreamingPlaceholder() {
  return (
    <div className="eadaf-next-step-streaming" aria-live="polite">
      加载操作建议…
    </div>
  );
}
