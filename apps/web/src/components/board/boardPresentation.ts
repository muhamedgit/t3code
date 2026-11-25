import type { SprintState, TicketPriority, TicketStatus } from "@t3tools/contracts";
import { msg } from "gt-react";
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  OctagonAlertIcon,
  SignalHighIcon,
  SignalLowIcon,
  SignalMediumIcon,
  SignalIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";

interface Presentation {
  readonly label: string;
  readonly Icon: LucideIcon;
  readonly toneClassName: string;
}

export const TICKET_STATUS_PRESENTATION: Readonly<Record<TicketStatus, Presentation>> = {
  todo: {
    label: msg("To do", { $context: "scrum board column" }),
    Icon: CircleDashedIcon,
    toneClassName: "text-muted-foreground",
  },
  doing: {
    label: msg("Doing", { $context: "scrum board column" }),
    Icon: CircleDotIcon,
    toneClassName: "text-info-foreground",
  },
  blocked: {
    label: msg("Blocked", { $context: "scrum board column" }),
    Icon: OctagonAlertIcon,
    toneClassName: "text-destructive-foreground",
  },
  done: {
    label: msg("Done", { $context: "scrum board column" }),
    Icon: CircleCheckIcon,
    toneClassName: "text-success-foreground",
  },
};

export const TICKET_PRIORITY_PRESENTATION: Readonly<Record<TicketPriority, Presentation>> = {
  urgent: {
    label: msg("Urgent", { $context: "ticket priority" }),
    Icon: TriangleAlertIcon,
    toneClassName: "text-destructive-foreground",
  },
  high: {
    label: msg("High", { $context: "ticket priority" }),
    Icon: SignalHighIcon,
    toneClassName: "text-warning-foreground",
  },
  medium: {
    label: msg("Medium", { $context: "ticket priority" }),
    Icon: SignalMediumIcon,
    toneClassName: "text-info-foreground",
  },
  low: {
    label: msg("Low", { $context: "ticket priority" }),
    Icon: SignalLowIcon,
    toneClassName: "text-muted-foreground",
  },
  none: {
    label: msg("No priority", { $context: "ticket priority" }),
    Icon: SignalIcon,
    toneClassName: "text-muted-foreground/60",
  },
};

export const SPRINT_STATE_LABELS: Readonly<Record<SprintState, string>> = {
  planned: msg("Planned", { $context: "sprint state" }),
  active: msg("Active", { $context: "sprint state" }),
  closed: msg("Closed", { $context: "sprint state" }),
};
