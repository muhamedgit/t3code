import { BOARD_PRIORITIES } from "@t3tools/client-runtime/state/board";
import {
  type Sprint,
  type SprintId,
  TicketLabel,
  type Ticket,
  type TicketPriority,
} from "@t3tools/contracts";
import { T, useGT, useMessages, Var } from "gt-react";
import { useId, useState, type ReactNode } from "react";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { TICKET_PRIORITY_PRESENTATION } from "./boardPresentation";

export interface TicketDraft {
  readonly title: string;
  readonly description: string;
  readonly priority: TicketPriority;
  readonly labels: ReadonlyArray<TicketLabel>;
}

/** Comma-separated labels, trimmed, without blanks or repeats. */
function parseTicketLabels(text: string): ReadonlyArray<TicketLabel> {
  const names = text
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  return [...new Set(names)].slice(0, 20).map((name) => TicketLabel.make(name));
}

/** Creates a ticket, or edits one when `ticket` is given. `children` renders under the fields. */
export function TicketDialog({
  ticket,
  onSubmit,
  onClose,
  children,
}: {
  readonly ticket?: Ticket | undefined;
  readonly onSubmit: (draft: TicketDraft) => Promise<boolean>;
  readonly onClose: () => void;
  readonly children?: ReactNode;
}) {
  const gt = useGT();
  const resolve = useMessages();
  const id = useId();
  const [title, setTitle] = useState(ticket?.title ?? "");
  const [description, setDescription] = useState(ticket?.description ?? "");
  const [priority, setPriority] = useState<TicketPriority>(ticket?.priority ?? "none");
  const [labels, setLabels] = useState(ticket?.labels.join(", ") ?? "");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (title.trim().length === 0 || submitting) return;
    setSubmitting(true);
    const saved = await onSubmit({
      title: title.trim(),
      description,
      priority,
      labels: parseTicketLabels(labels),
    });
    setSubmitting(false);
    if (saved) onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup className="sm:max-w-xl">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{ticket === undefined ? <T>New ticket</T> : ticket.key}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-title`}>
                <T>Title</T>
              </Label>
              <Input
                id={`${id}-title`}
                value={title}
                maxLength={512}
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-description`}>
                <T>Description</T>
              </Label>
              <Textarea
                id={`${id}-description`}
                value={description}
                rows={5}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>
                  <T>Priority</T>
                </Label>
                <Select
                  value={priority}
                  onValueChange={(value) => {
                    if (value !== null) setPriority(value);
                  }}
                >
                  <SelectTrigger aria-label={gt("Priority")} size="sm">
                    <SelectValue>
                      {resolve(TICKET_PRIORITY_PRESENTATION[priority].label)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {BOARD_PRIORITIES.map((option) => {
                      const presentation = TICKET_PRIORITY_PRESENTATION[option];
                      return (
                        <SelectItem key={option} value={option}>
                          <presentation.Icon
                            aria-hidden
                            className={`size-3.5 ${presentation.toneClassName}`}
                          />
                          {resolve(presentation.label)}
                        </SelectItem>
                      );
                    })}
                  </SelectPopup>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-labels`}>
                  <T>Labels</T>
                </Label>
                <Input
                  id={`${id}-labels`}
                  value={labels}
                  placeholder={gt("bug, frontend")}
                  onChange={(event) => setLabels(event.target.value)}
                />
              </div>
            </div>
            {children}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <T>Cancel</T>
            </Button>
            <Button type="submit" disabled={title.trim().length === 0 || submitting}>
              {ticket === undefined ? <T>Create ticket</T> : <T>Save</T>}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

/** Names a new sprint. */
export function SprintDialog({
  onSubmit,
  onClose,
}: {
  readonly onSubmit: (sprint: { readonly name: string; readonly goal: string }) => Promise<boolean>;
  readonly onClose: () => void;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (name.trim().length === 0 || submitting) return;
    setSubmitting(true);
    const saved = await onSubmit({ name: name.trim(), goal: goal.trim() });
    setSubmitting(false);
    if (saved) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup className="sm:max-w-md">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <T>New sprint</T>
            </DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-name`}>
                <T>Name</T>
              </Label>
              <Input
                id={`${id}-name`}
                value={name}
                maxLength={200}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-goal`}>
                <T>Goal</T>
              </Label>
              <Textarea
                id={`${id}-goal`}
                value={goal}
                rows={3}
                onChange={(event) => setGoal(event.target.value)}
              />
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <T>Cancel</T>
            </Button>
            <Button type="submit" disabled={name.trim().length === 0 || submitting}>
              <T>Create sprint</T>
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

/**
 * Completes a sprint that still has open tickets, asking where they go: another open sprint or
 * the backlog (the default).
 */
export function CompleteSprintDialog({
  sprint,
  openTicketCount,
  destinations,
  onSubmit,
  onClose,
}: {
  readonly sprint: Sprint;
  readonly openTicketCount: number;
  readonly destinations: ReadonlyArray<Sprint>;
  readonly onSubmit: (carryOverTo: SprintId | null) => Promise<boolean>;
  readonly onClose: () => void;
}) {
  const gt = useGT();
  const [target, setTarget] = useState<string>(destinations[0]?.id ?? "backlog");
  const [submitting, setSubmitting] = useState(false);
  const targetName =
    destinations.find((candidate) => candidate.id === target)?.name ?? gt("Backlog");
  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    const chosen = destinations.find((candidate) => candidate.id === target)?.id ?? null;
    const saved = await onSubmit(chosen);
    setSubmitting(false);
    if (saved) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup className="sm:max-w-md">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <T>
                Complete <Var>{sprint.name}</Var>
              </T>
            </DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-1.5">
              <Label>
                {gt("{count, plural, one {Move # open ticket to} other {Move # open tickets to}}", {
                  count: openTicketCount,
                })}
              </Label>
              <Select<string>
                value={target}
                onValueChange={(value) => {
                  if (value !== null) setTarget(value);
                }}
              >
                <SelectTrigger aria-label={gt("Destination for open tickets")} size="sm">
                  <SelectValue>{targetName}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {destinations.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="backlog">
                    <T>Backlog</T>
                  </SelectItem>
                </SelectPopup>
              </Select>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <T>Cancel</T>
            </Button>
            <Button type="submit" disabled={submitting}>
              <T>Complete sprint</T>
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
