export const CONFIG = {
  appName: "Admin Hub",
  moduleName: "PACE Dashboard",
  sitePath: "siu29.sharepoint.com:/sites/IEP_Skook:",
  lists: { users: "IEP_Users2", appUsers: "IEP_App_Users", paceVisits: "IEP_Pace_Visits", students: "IEP_Students_2026_27" },
  auth: {
    clientId: "145a3fc7-5cff-4d03-96c7-577e17980110",
    authority: "https://login.microsoftonline.com/3276761c-22db-462b-a930-172d155bd795",
    // Same scopes as MAC-Walkthrough, which shares this app registration.
    scopes: ["User.Read", "Sites.ReadWrite.All"]
  },
  // The only lists Admin Hub may add rows to (the roster). It never edits or
  // deletes, and every other list, PACE included, stays read-only.
  writableLists: ["IEP_Users2", "IEP_Students_2026_27"],
  roster: {
    // New students start Active only; PACE and Daily Pulse are opt-in, as in MAC-Walkthrough.
    studentDefaults: { active: true, paceEnabled: false, dailyPulseEnabled: false },
    teacherRole: "Teacher"
  },
  // Follow-up stays off until the IEP_Pace_Follow_Up SharePoint list exists;
  // until then follow-up state would only live in browser memory.
  followUp: { enabled: false },
  authorization: {
    // IEP_App_Users column that grants Admin Hub access. Shared with the
    // MAC-Walkthrough Admin Panel, so one flag grants both.
    permissionField: "Admin Panel",
    // false = users with no IEP_App_Users row fall back to the active
    // IEP_Users2 Administrator role. Turn on once every user has a row.
    enforceAppUsers: false
  },
  paceFieldAliases: {
    student: ["Student", "Student Name", "StudentName", "studentName"],
    date: ["Date", "Visit Date", "date"],
    timeIn: ["Time In", "TimeIn", "timeIn"],
    timeOut: ["Time Out", "TimeOut", "timeOut"],
    duration: ["Duration", "Duration Minutes", "DurationMinutes", "durationMinutes"],
    room: ["Room", "PACE Room", "Pace Room", "paceRoom"],
    specialist: ["Behavior Specialist", "Staff Member", "Submitted By", "submittedByName"],
    teacher: ["Teacher Came From", "Teacher", "teacherCameFrom"],
    reason: ["Reason", "Behavior", "Behaviors", "behaviors"],
    intervention: ["Intervention Used", "Interventions", "Support", "Supports", "interventions"],
    scm: ["SCM Used", "SCM", "scmUsed"],
    notes: ["Notes", "Visit Notes", "notes"],
    submittedAt: ["Submitted At", "Created", "createdAt", "timestamp"],
    modified: ["Modified"],
    editor: ["Editor"]
  }
};

export const MODULES = [
  { id: "pace", label: "PACE", description: "Visits, usage patterns, duration, interventions, activity and follow-up.", active: true },
  { id: "roster", label: "Roster", description: "Add students and teachers to the IEP Skook roster.", active: true }
];
