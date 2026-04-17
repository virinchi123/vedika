import type {
  EventBookingGetPayload,
  EventBookingSelect,
} from "../generated/prisma/models/EventBooking.js";
import type {
  FollowupGetPayload,
  FollowupSelect,
} from "../generated/prisma/models/Followup.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  buildCursorPage,
  type CursorListResult,
  type CursorPageParams,
} from "../lib/listing.js";
import { prisma } from "../lib/prisma.js";

export type CalendarEventType = "event_booking" | "followup";

type CalendarEventRecord = {
  date: Date;
  type: CalendarEventType;
  objectId: string;
};

export type CalendarEventResponse = {
  date: string;
  type: CalendarEventType;
  objectId: string;
};

export type CalendarEventCursor = {
  date: Date;
  type: CalendarEventType;
  objectId: string;
};

export type ListCalendarEventsInput = CursorPageParams<CalendarEventCursor> & {
  fromDate: Date;
  toDate: Date;
};

export type ListCalendarEventsResponse = CursorListResult<CalendarEventResponse>;

const eventBookingCalendarEventSelect = {
  id: true,
  muhurat: true,
} satisfies EventBookingSelect;

type EventBookingCalendarEventRecord = EventBookingGetPayload<{
  select: typeof eventBookingCalendarEventSelect;
}>;

const followupCalendarEventSelect = {
  id: true,
  dueDate: true,
} satisfies FollowupSelect;

type FollowupCalendarEventRecord = FollowupGetPayload<{
  select: typeof followupCalendarEventSelect;
}>;

const serializeCalendarEvent = (
  calendarEvent: CalendarEventRecord,
): CalendarEventResponse => {
  return {
    date: calendarEvent.date.toISOString(),
    type: calendarEvent.type,
    objectId: calendarEvent.objectId,
  };
};

const compareCalendarEvents = (
  left: CalendarEventRecord,
  right: CalendarEventRecord,
): number => {
  const dateDifference = left.date.getTime() - right.date.getTime();

  if (dateDifference !== 0) {
    return dateDifference;
  }

  const typeComparison = left.type.localeCompare(right.type);

  if (typeComparison !== 0) {
    return typeComparison;
  }

  return left.objectId.localeCompare(right.objectId);
};

const getCalendarEventCursor = (
  calendarEvent: CalendarEventRecord,
): CalendarEventCursor => {
  return {
    date: calendarEvent.date,
    type: calendarEvent.type,
    objectId: calendarEvent.objectId,
  };
};

const buildFollowupCursorWhere = (
  cursor: CalendarEventCursor | null,
): Prisma.FollowupWhereInput | undefined => {
  if (cursor === null) {
    return undefined;
  }

  if (cursor.type === "event_booking") {
    return {
      dueDate: {
        gte: cursor.date,
      },
    };
  }

  return {
    OR: [
      {
        dueDate: {
          gt: cursor.date,
        },
      },
      {
        dueDate: cursor.date,
        id: {
          gt: cursor.objectId,
        },
      },
    ],
  };
};

const buildEventBookingCursorWhere = (
  cursor: CalendarEventCursor | null,
): Prisma.EventBookingWhereInput | undefined => {
  if (cursor === null) {
    return undefined;
  }

  if (cursor.type === "followup") {
    return {
      muhurat: {
        gt: cursor.date,
      },
    };
  }

  return {
    OR: [
      {
        muhurat: {
          gt: cursor.date,
        },
      },
      {
        muhurat: cursor.date,
        id: {
          gt: cursor.objectId,
        },
      },
    ],
  };
};

const toCalendarEventFromFollowup = (
  followup: FollowupCalendarEventRecord,
): CalendarEventRecord => {
  return {
    date: followup.dueDate,
    type: "followup",
    objectId: followup.id,
  };
};

const toCalendarEventFromEventBooking = (
  eventBooking: EventBookingCalendarEventRecord,
): CalendarEventRecord => {
  return {
    date: eventBooking.muhurat!,
    type: "event_booking",
    objectId: eventBooking.id,
  };
};

const mergeCalendarEvents = (
  eventBookings: CalendarEventRecord[],
  followups: CalendarEventRecord[],
  limit: number,
): CalendarEventRecord[] => {
  const merged: CalendarEventRecord[] = [];
  let eventBookingIndex = 0;
  let followupIndex = 0;
  const maxItems = limit + 1;

  while (
    merged.length < maxItems &&
    (
      eventBookingIndex < eventBookings.length ||
      followupIndex < followups.length
    )
  ) {
    const nextEventBooking = eventBookings[eventBookingIndex];
    const nextFollowup = followups[followupIndex];

    if (nextEventBooking === undefined) {
      merged.push(nextFollowup!);
      followupIndex += 1;
      continue;
    }

    if (nextFollowup === undefined) {
      merged.push(nextEventBooking);
      eventBookingIndex += 1;
      continue;
    }

    if (compareCalendarEvents(nextEventBooking, nextFollowup) <= 0) {
      merged.push(nextEventBooking);
      eventBookingIndex += 1;
      continue;
    }

    merged.push(nextFollowup);
    followupIndex += 1;
  }

  return merged;
};

export const listCalendarEvents = async ({
  limit,
  cursor,
  fromDate,
  toDate,
}: ListCalendarEventsInput): Promise<ListCalendarEventsResponse> => {
  const followupWhereConditions: Prisma.FollowupWhereInput[] = [
    {
      dueDate: {
        gte: fromDate,
      },
    },
    {
      dueDate: {
        lte: toDate,
      },
    },
  ];
  const followupCursorWhere = buildFollowupCursorWhere(cursor);

  if (followupCursorWhere !== undefined) {
    followupWhereConditions.push(followupCursorWhere);
  }

  const eventBookingWhereConditions: Prisma.EventBookingWhereInput[] = [
    {
      muhurat: {
        not: null,
      },
    },
    {
      muhurat: {
        gte: fromDate,
      },
    },
    {
      muhurat: {
        lte: toDate,
      },
    },
  ];
  const eventBookingCursorWhere = buildEventBookingCursorWhere(cursor);

  if (eventBookingCursorWhere !== undefined) {
    eventBookingWhereConditions.push(eventBookingCursorWhere);
  }

  const [followups, eventBookings] = await Promise.all([
    prisma.followup.findMany({
      where: {
        AND: followupWhereConditions,
      },
      orderBy: [
        {
          dueDate: "asc",
        },
        {
          id: "asc",
        },
      ],
      take: limit + 1,
      select: followupCalendarEventSelect,
    }),
    prisma.eventBooking.findMany({
      where: {
        AND: eventBookingWhereConditions,
      },
      orderBy: [
        {
          muhurat: "asc",
        },
        {
          id: "asc",
        },
      ],
      take: limit + 1,
      select: eventBookingCalendarEventSelect,
    }),
  ]);

  const mergedCalendarEvents = mergeCalendarEvents(
    eventBookings.map(toCalendarEventFromEventBooking),
    followups.map(toCalendarEventFromFollowup),
    limit,
  );
  const page = buildCursorPage({
    items: mergedCalendarEvents,
    limit,
    getCursor: getCalendarEventCursor,
  });

  return {
    items: page.items.map(serializeCalendarEvent),
    pageInfo: page.pageInfo,
  };
};
