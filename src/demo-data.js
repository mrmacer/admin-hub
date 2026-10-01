import { addDays, localDateString } from "./date-utils.js";

const STUDENTS = Array.from({ length: 20 }, (_, index) => `Demo Student ${String(index + 1).padStart(2, "0")}`);
const SPECIALISTS = ["Specialist A", "Specialist B", "Specialist C", "Specialist D"];
const CLASSROOMS = ["Classroom Alpha", "Classroom Beta", "Classroom Gamma", "Classroom Delta", "Classroom Epsilon"];
const ROOMS = ["PACE Room 1", "PACE Room 2", "PACE Room 3"];
const REASONS = ["Transition support", "Break request", "Peer problem-solving", "Regulation support", "Return-to-class planning", "Task reset"];
const INTERVENTIONS = ["Calm space", "Break / reset", "De-escalation conversation", "Sensory support", "Problem-solving conference", "Check-in / check-out", "Return-to-class plan", "Adult support"];
const NOTES = ["Fictional demo note: plan reviewed.", "Fictional demo note: student returned to scheduled setting.", "Fictional demo note: support selected from demo taxonomy.", ""];

function clock(hour, minute) { return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`; }

// Deterministic synthetic history: 184 records across 90 local calendar days.
// Names, IDs, notes, and labels are intentionally unmistakable demo values.
export function makeDemoVisits(today = localDateString()) {
  const rows = []; let sequence = 1;
  for (let offset = 0; offset < 90; offset += 1) {
    const date = addDays(today, -offset);
    const count = offset === 0 ? 5 : 1 + ((offset * 17) % 3);
    for (let index = 0; index < count; index += 1) {
      const repeatedStudent = offset % 5 === 0 && index === 1;
      const studentIndex = (offset * 3 + (repeatedStudent ? 0 : index * 5)) % STUDENTS.length;
      const hour = 8 + ((offset * 2 + index * 3) % 8);
      const minute = (offset * 13 + index * 17) % 60;
      const open = offset === 0 && index === count - 1;
      const duration = 12 + ((offset * 11 + index * 13) % 58);
      rows.push({
        id: `demo-${String(sequence).padStart(3, "0")}`,
        Student: STUDENTS[studentIndex], Date: date, "Time In": clock(hour, minute),
        "Time Out": open ? "" : clock(hour + Math.floor((minute + duration) / 60), (minute + duration) % 60),
        Duration: open ? "" : duration, Room: ROOMS[(offset + index) % ROOMS.length],
        "Behavior Specialist": SPECIALISTS[(offset + index * 2) % SPECIALISTS.length],
        "Teacher Came From": CLASSROOMS[(offset * 3 + index) % CLASSROOMS.length],
        Reason: REASONS[(offset + index) % REASONS.length],
        "Intervention Used": INTERVENTIONS[(offset * 2 + index) % INTERVENTIONS.length],
        "SCM Used": open ? "" : (offset + index * 2) % 8 === 0,
        Notes: NOTES[(offset + index) % NOTES.length]
      });
      sequence += 1;
    }
  }
  return rows;
}

export const DEMO_DATASET_META = { studentCount: STUDENTS.length, specialistCount: SPECIALISTS.length, classroomCount: CLASSROOMS.length, roomCount: ROOMS.length, reasons: REASONS, interventions: INTERVENTIONS };
export const DEMO_MODE_NOTICE = "DEMO · Synthetic Data Only — no student records are connected.";
