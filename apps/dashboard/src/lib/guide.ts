/**
 * The staff guide: what each page of the dashboard is for and how to use it. It lives in the dashboard, behind the staff
 * sign-in, so only people with an account can read it. Each page of the dashboard links to its own section (`guideIdForPath`).
 * When a page changes, change its section here.
 */

export interface GuideSection {
  readonly id: string;
  readonly title: string;
  /** Matches the menu's colour for the area. */
  readonly area: 'start' | 'ops' | 'compliance' | 'money' | 'team';
  /** One line, shown in the contents. */
  readonly summary: string;
  /** Who can open the page, in the words the Users screen uses. */
  readonly access: string;
  /** What the page is for. */
  readonly about: readonly string[];
  /** How to do the usual things, in order. */
  readonly steps: readonly { readonly heading: string; readonly steps: readonly string[] }[];
  /** Things worth knowing. */
  readonly tips: readonly string[];
}

export const GUIDE: readonly GuideSection[] = [
  {
    id: 'start',
    title: 'Getting started',
    area: 'start',
    summary: 'Signing in, what you can see, and the order to set things up.',
    access: 'Everyone with a staff account.',
    about: [
      'The dashboard is where a firm sends jobs to its drivers, sees where they are, keeps its vehicles legal, and works out what each job made. The driver app is the other half: drivers see their jobs there, and what they do there shows up here.',
      'You sign in with your email, your password and a second step (an authenticator app, or a code by text or email). The menu on the left only shows the pages your account is allowed to use. If a page you expect is missing, ask someone at your firm who can manage users to change your privileges.',
    ],
    steps: [
      {
        heading: 'Setting a firm up, in order',
        steps: [
          'Vehicle profiles: add each vehicle with its registration, height, width, length and weight.',
          'Drivers: give drivers your join code, or invite them by email, then approve their requests.',
          'Walk-round checks (optional): build the list your drivers answer before taking a vehicle out.',
          'Maintenance: enter when each MOT, inspection and service is next due.',
          'Running costs and pay: enter what vehicles and drivers cost, so job profit means something.',
          'Jobs: create a job, assign a driver and vehicle, and the driver is told.',
        ],
      },
      {
        heading: 'What the privileges mean',
        steps: [
          'Manage users: invite and remove staff, change privileges, see the activity log, and change company settings.',
          'Manage vehicles and drivers: vehicle profiles, drivers, and walk-round check lists.',
          'Dispatch jobs: create, assign and cancel jobs.',
          'See the live map and See reports: read-only views of where drivers are and what has happened.',
          'Manage billing: running costs, job profit, looking ahead, and your plan and invoices.',
          'Keep maintenance dates: add and change maintenance dates.',
          'A Manager has all of these. A Dispatcher has vehicles and drivers, dispatch, the live map and reports. A Viewer has the live map and reports.',
        ],
      },
    ],
    tips: ['The pages are a planning aid. They never stop a vehicle being sent out; you decide.'],
  },
  {
    id: 'overview',
    title: 'Overview',
    area: 'start',
    summary: 'What needs attention today.',
    access: 'Everyone.',
    about: [
      'Your starting page. It gathers what needs attention today in one place: jobs on the road now, maintenance that is overdue or due soon, and the day’s walk-round checks. Each tile and panel takes you to the page with the detail.',
    ],
    steps: [
      {
        heading: 'Using it',
        steps: [
          'Read the tiles across the top for the numbers that matter today.',
          'Open a panel’s link to go to the page behind it.',
          'Come back here at the start of the day to see what changed overnight.',
        ],
      },
    ],
    tips: ['What you see depends on your privileges, so two people may see different tiles.'],
  },
  {
    id: 'jobs',
    title: 'Jobs',
    area: 'ops',
    summary: 'Create jobs and give each one a driver and a vehicle.',
    access: 'Everyone can look. Creating, assigning and cancelling needs Dispatch jobs.',
    about: [
      'A job is a list of stops in the order the driver does them, with a reference, and optionally a customer and a price. Once you assign a driver and a vehicle the driver is told, and sees the job in the app. As the driver accepts it and works through the stops, the status here changes.',
    ],
    steps: [
      {
        heading: 'Create a job',
        steps: [
          'Under Create a job, type a reference.',
          'Add the customer and the price if you want job profit to work for it.',
          'Add the stops in the order the driver does them. If a stop is near a gate your drivers have marked, it is offered to you.',
          'Choose Create job.',
        ],
      },
      {
        heading: 'Assign it',
        steps: [
          'Find the job under All jobs.',
          'Choose the driver, then the vehicle. A route preview shows whether the vehicle fits the way there.',
          'Assign. The driver gets a notification.',
        ],
      },
      {
        heading: 'Afterwards',
        steps: [
          'Send notification again, if a driver says they did not get it.',
          'Customer and price, to add or change them after the job exists.',
          'View photo, to see a proof-of-delivery photo.',
          'Delivery record, to open an internal copy or a customer copy of a delivered job.',
          'Cancel, to stop a job that has not been done.',
        ],
      },
    ],
    tips: [
      'A job that needs proof of delivery cannot be marked delivered until the driver has taken the photo.',
      'Delivery photos are deleted after the period set under Settings. The job and its record stay.',
      'A price is what you charge the customer. Wages, fuel and running costs come from the other pages.',
    ],
  },
  {
    id: 'live-trips',
    title: 'Live trips',
    area: 'ops',
    summary: 'Where vehicles on a job are right now.',
    access: 'Needs See the live map.',
    about: [
      'A map and a list of every vehicle on a job right now, with an arrival time for each. A position only updates while the driver has the app open and a job on the road.',
    ],
    steps: [
      {
        heading: 'Using it',
        steps: [
          'Choose a job in the list to see that vehicle’s route to where it is heading on the map.',
          'Check “last seen” before relying on a dot. An old time means the app has been closed or the phone has no signal.',
          'The arrival time allows for the breaks the driver is expected to take.',
        ],
      },
    ],
    tips: [
      'Drivers are only shared while a job is on the road. Nobody is tracked in the background.',
      'A vehicle that is missing from the map has no job on the road, or its driver has the app closed.',
    ],
  },
  {
    id: 'drivers',
    title: 'Drivers',
    area: 'ops',
    summary: 'Who drives for you, and how new drivers join.',
    access: 'Needs Manage vehicles and drivers.',
    about: [
      'The people who drive for your firm. Drivers use the WagonWise driver app, and nobody joins by themselves: every request needs approving here.',
    ],
    steps: [
      {
        heading: 'Add a driver with your join code',
        steps: [
          'Give the driver your join code. It is shown on this page.',
          'They enter it in the app to ask to join.',
          'Their request appears under Pending requests. Approve it.',
        ],
      },
      {
        heading: 'Invite by email',
        steps: [
          'Under Invite a driver, type their email and send.',
          'They sign in to the app with that email and accept under Settings, My companies.',
        ],
      },
      {
        heading: 'Give a driver a name',
        steps: [
          'Under Active drivers, choose Rename beside the driver.',
          'Type the name your team should see, such as “Dave K (artic 3)”, and save.',
          'Leave it blank to go back to the name the driver gave themselves, or their phone or email if they have not given one.',
        ],
      },
      {
        heading: 'If you drive too',
        steps: ['Choose Add me as a driver. You then show as “(you)” when assigning jobs.'],
      },
    ],
    tips: [
      'Everywhere in the portal shows your name for a driver first, then the name the driver gave in the app, then their phone or email.',
      'Regenerate code if a code has got out. The old one stops working for anyone who has not used it yet.',
      'A new driver who has not used the app before needs an invite code from WagonWise for their first sign-in.',
    ],
  },
  {
    id: 'places',
    title: 'Places',
    area: 'ops',
    summary: 'Gates and entrances your drivers have marked.',
    access: 'Everyone can look. Dispatchers can edit.',
    about: [
      'Some places cannot be found from a postcode, such as a farm whose postcode lands on the road. Drivers mark the real gate in the app, and it is saved here. When you create a job near that postcode, the saved place is offered.',
    ],
    steps: [
      {
        heading: 'Keeping them tidy',
        steps: [
          'Improve a note so the next driver knows which gate to use.',
          'Rename a place so it is easy to recognise.',
          'Remove one that is wrong or no longer used.',
        ],
      },
    ],
    tips: ['Drivers add new places from the app. You cannot add them here.'],
  },
  {
    id: 'fuel',
    title: 'Fuel',
    area: 'money',
    summary: 'Bring in a fuel card statement.',
    access: 'Needs Manage vehicles and drivers, or See reports.',
    about: [
      'Bring in your fuel card statement to see what each vehicle spends and what you pay a litre. Fuel is matched to a vehicle by its registration, and it feeds into the cost of each job.',
    ],
    steps: [
      {
        heading: 'Import a statement',
        steps: [
          'Save the statement from your fuel card provider as a CSV file.',
          'Under Import a statement, choose the file.',
          'Tell it which columns hold the registration, the date, the litres and the cost, and import.',
        ],
      },
      {
        heading: 'Fix anything unmatched',
        steps: [
          'Rows with a registration it does not know appear under Needs matching.',
          'Add the registration on Vehicle profiles, or choose the vehicle by hand.',
        ],
      },
    ],
    tips: [
      'Past imports lists what you have brought in, so you can see what has been done.',
      'Add every registration on Vehicle profiles first, or most rows will need matching.',
    ],
  },
  {
    id: 'costs',
    title: 'Running costs and pay',
    area: 'money',
    summary: 'What vehicles and drivers cost to run.',
    access: 'Needs Manage billing.',
    about: [
      'What your vehicles and drivers cost. Enter each cost once and it carries on every month until you change or stop it. Fuel comes from the Fuel page. Together these are what the cost of a job is worked out from.',
    ],
    steps: [
      {
        heading: 'Running costs',
        steps: [
          'Add a cost: what it is, how much, and whether it belongs to one vehicle or the whole firm.',
          'Set when it starts. It carries on each month until you stop it.',
          'To change a cost, stop the old one and add a new one from the month it changes.',
        ],
      },
      {
        heading: 'What drivers cost an hour',
        steps: ['Enter the hourly cost for each driver. It is multiplied by the time a job takes.'],
      },
    ],
    tips: [
      'A cost can belong to one vehicle or to the whole firm (an overhead). An overhead is shown on its own and is not added to a vehicle’s costs.',
    ],
  },
  {
    id: 'job-costs',
    title: 'Job profit',
    area: 'money',
    summary: 'What each job cost and made.',
    access: 'Needs Manage billing.',
    about: [
      'What each job cost and made, by job, vehicle and customer. Prices come from the jobs, fuel from the Fuel page, and running costs and driver rates from Running costs and pay.',
    ],
    steps: [
      {
        heading: 'Reading it',
        steps: [
          'Choose a month. The tiles show revenue, wages, fuel, running costs, and profit for the month.',
          'Under By job, each delivered job has its price, its costs, and what it made.',
          'Use the other tabs to see the same figures by vehicle and by customer.',
        ],
      },
    ],
    tips: [
      'A job with no price counts as no revenue. Add the price on Jobs, under Customer and price.',
      'The figures are only as good as what you enter on Fuel and Running costs and pay.',
    ],
  },
  {
    id: 'outlook',
    title: 'Looking ahead',
    area: 'money',
    summary: 'How the last few months went, and the next three.',
    access: 'Needs Manage billing.',
    about: [
      'How the last six months went, and a guess at the next three if the work carries on as it has. It is built from the same figures as Job profit, so it needs at least one full month of jobs before it can forecast.',
    ],
    steps: [
      {
        heading: 'Using it',
        steps: [
          'Read the chart for revenue and costs by month.',
          'Use the what-if sliders to see what a change to work or costs would do. Nothing you move is saved.',
        ],
      },
    ],
    tips: [
      'The forecast uses the average of the last three complete months that had jobs. It is a guide, not a promise.',
    ],
  },
  {
    id: 'checks',
    title: 'Walk-round checks',
    area: 'compliance',
    summary: 'Build the list your drivers answer before taking a vehicle out.',
    access: 'Needs Manage vehicles and drivers.',
    about: [
      'Every firm builds its own check list, and you can make different lists for different vehicles. Drivers answer them in the app before taking a vehicle out. If you do not want checks, leave this empty.',
    ],
    steps: [
      {
        heading: 'Build a list',
        steps: [
          'Choose New check list, or New list from the example.',
          'Give the list a name, such as the type of vehicle it is for, and add the questions drivers answer.',
          'Choose whether it is for every vehicle or only the ones you pick.',
          'Save. Drivers see it the next time they take one of those vehicles out.',
        ],
      },
    ],
    tips: [
      'The example list is only a starting point and is not complete. You are responsible for what your checks cover.',
    ],
  },
  {
    id: 'check-results',
    title: 'Check results',
    area: 'compliance',
    summary: 'The checks your drivers have done.',
    access: 'Needs Manage vehicles and drivers, Dispatch jobs, or See reports.',
    about: [
      'One line per walk-round check your drivers have done: who, which vehicle, when, and whether anything was wrong. Defects they found are on the Defects page.',
    ],
    steps: [
      {
        heading: 'Using it',
        steps: [
          'Look down the list for any check with a problem.',
          'Choose Open on a result to read the answers and see any photos.',
          'Go to Defects to deal with anything that was found.',
        ],
      },
    ],
    tips: ['A vehicle with no check today is as important as a vehicle with a failed one.'],
  },
  {
    id: 'defects',
    title: 'Defects',
    area: 'compliance',
    summary: 'What the checks found, and whether it is dealt with.',
    access: 'Needs Manage vehicles and drivers, Dispatch jobs, or See reports.',
    about: [
      'What your drivers’ walk-round checks found. Each defect moves through three steps, and the page records who moved it and when.',
    ],
    steps: [
      {
        heading: 'Working through them',
        steps: [
          'Open: a driver has reported it and nobody has looked yet.',
          'Seen: mark a defect seen when you have read it.',
          'Fixed: mark it fixed once it has been dealt with.',
        ],
      },
    ],
    tips: [
      'Marking a defect seen or fixed needs Manage vehicles and drivers, or Dispatch jobs. Everyone else can read.',
    ],
  },
  {
    id: 'maintenance',
    title: 'Maintenance',
    area: 'compliance',
    summary: 'When MOTs, inspections and services fall due.',
    access: 'Needs Keep maintenance dates, or the check pages’ privileges.',
    about: [
      'When MOTs, inspections and services fall due on your vehicles. It reminds you; it never stops a vehicle being sent out.',
    ],
    steps: [
      {
        heading: 'Add something to keep track of',
        steps: [
          'Choose Add, then pick the vehicle and what it is (an MOT, an inspection, a service).',
          'Enter the date it is next due.',
          'Save. It joins the list, sorted so overdue comes first.',
        ],
      },
      {
        heading: 'Bring in many dates at once',
        steps: [
          'Use Import dates with a CSV file of registrations, item names and due dates.',
          'Each row sets the next-due date for that vehicle and item. Rows that do not match are reported, row by row.',
        ],
      },
    ],
    tips: [
      'When a date passes, the item shows as overdue until you enter the new date.',
      'Vehicles are matched by registration, so keep Vehicle profiles up to date.',
    ],
  },
  {
    id: 'vehicle-profiles',
    title: 'Vehicle profiles',
    area: 'compliance',
    summary: 'Your fleet, with the size of each vehicle.',
    access: 'Needs Manage vehicles and drivers.',
    about: [
      'Your company’s own fleet. The height, width, length and weight you enter are what WagonWise uses to plan routes that fit the vehicle, so check them against your paperwork.',
    ],
    steps: [
      {
        heading: 'Add a vehicle',
        steps: [
          'Choose to add a vehicle and give it a name.',
          'Enter the registration. Fuel and maintenance match to this.',
          'Enter the height, width, length and weight.',
          'Save. You can now assign it to jobs.',
        ],
      },
    ],
    tips: [
      'A wrong height can send a driver towards a bridge that is too low. Measure, and check twice.',
      'Drivers also keep their own vehicle profile in the app. These are the firm’s vehicles.',
    ],
  },
  {
    id: 'reports',
    title: 'Reports',
    area: 'ops',
    summary: 'Every job with activity in a period.',
    access: 'Needs See reports.',
    about: [
      'Jobs with any activity in the period you choose: created, assigned, accepted, delivered or finished. Times are in your time zone.',
    ],
    steps: [
      {
        heading: 'Run a report',
        steps: [
          'Choose the dates, and filter if you want to narrow it down.',
          'Read the table, or choose Download CSV to open it in a spreadsheet.',
        ],
      },
    ],
    tips: ['The CSV has what the table shows, so filter first and then download.'],
  },
  {
    id: 'users',
    title: 'Users',
    area: 'team',
    summary: 'Invite staff and decide what each person can do.',
    access: 'Needs Manage users.',
    about: [
      'Everyone at your firm with a dashboard account. You decide what each person can do by choosing their privileges.',
    ],
    steps: [
      {
        heading: 'Invite someone',
        steps: [
          'Type their name and email.',
          'Pick a role (Manager, Dispatcher or Viewer), or choose the privileges one by one.',
          'Send the invite. They open the link, set a password, and pick a second step for signing in.',
        ],
      },
      {
        heading: 'Change or remove access',
        steps: [
          'Find the person in the list and change their privileges.',
          'Remove them when they leave. Their access stops straight away.',
        ],
      },
    ],
    tips: [
      'You can only give someone privileges you hold yourself.',
      'Give people the least they need. A viewer can see where drivers are without being able to change anything.',
    ],
  },
  {
    id: 'activity',
    title: 'Activity',
    area: 'team',
    summary: 'Sign-ins, invites and changes to who can do what.',
    access: 'Needs Manage users.',
    about: [
      'A log of sign-ins, invites and every change to who can do what, for the latest 200 entries. Use it to answer “who changed that?”.',
    ],
    steps: [
      {
        heading: 'Using it',
        steps: [
          'Read down the list. You can sort it by clicking a column heading.',
          'Look for sign-ins you do not recognise, and remove access if something looks wrong.',
        ],
      },
    ],
    tips: ['Only the latest 200 entries are shown.'],
  },
  {
    id: 'plan',
    title: 'Plan and invoices',
    area: 'team',
    summary: 'What you pay WagonWise.',
    access: 'Needs Manage billing.',
    about: [
      'Your plan with WagonWise and the invoices for it. Each month’s invoice is drafted from your plan, then issued with a number.',
    ],
    steps: [
      {
        heading: 'Using it',
        steps: [
          'Read your plan at the top.',
          'Open an invoice to read it, or print it from its page.',
        ],
      },
    ],
    tips: ['Questions about an invoice go to support@wagon-wise.co.uk.'],
  },
  {
    id: 'settings',
    title: 'Settings',
    area: 'team',
    summary: 'Choices your firm makes about its own data.',
    access: 'Needs Manage users. Only managers can change a setting.',
    about: [
      'Choices your company makes about its own data. For now that is how long delivery photos are kept.',
    ],
    steps: [
      {
        heading: 'How long delivery photos are kept',
        steps: [
          'Choose a period under Keep photos for.',
          'Save. Photos older than this are deleted automatically. The job itself stays.',
        ],
      },
    ],
    tips: [
      'If you need to keep proof for longer, download what you need before the photo is deleted.',
      'You are the controller of your delivery records, so the period is your choice. WagonWise deletes on your instruction.',
    ],
  },
];

/**
 * Which section of the guide a page belongs to. `/` and `/fleet` are both the overview. Pages with no guide (the WagonWise
 * admin pages) have none, so they get no link.
 */
const PAGE_SECTIONS: readonly (readonly [path: string, id: string])[] = [
  ['/fleet/jobs', 'jobs'],
  ['/fleet/live-trips', 'live-trips'],
  ['/fleet/drivers', 'drivers'],
  ['/fleet/places', 'places'],
  ['/fleet/fuel', 'fuel'],
  ['/fleet/costs', 'costs'],
  ['/fleet/job-costs', 'job-costs'],
  ['/fleet/outlook', 'outlook'],
  ['/fleet/checks', 'checks'],
  ['/fleet/check-results', 'check-results'],
  ['/fleet/defects', 'defects'],
  ['/fleet/maintenance', 'maintenance'],
  ['/fleet/vehicle-profiles', 'vehicle-profiles'],
  ['/fleet/reports', 'reports'],
  ['/staff/users', 'users'],
  ['/staff/activity', 'activity'],
  ['/staff/plan', 'plan'],
  ['/staff/settings', 'settings'],
];

/** The guide section for the page at `pathname`, or undefined when there is none. */
export function guideIdForPath(pathname: string): string | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/' || path === '/fleet') return 'overview';
  return PAGE_SECTIONS.find(([page]) => path === page || path.startsWith(`${page}/`))?.[1];
}

export function guideSection(id: string | undefined): GuideSection | undefined {
  return GUIDE.find((section) => section.id === id);
}

/** Search the guide: sections whose title, summary or text hold every word typed. Empty input matches everything. */
export function searchGuide(query: string): readonly GuideSection[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return GUIDE;
  return GUIDE.filter((section) => {
    const text = [
      section.title,
      section.summary,
      section.access,
      ...section.about,
      ...section.steps.flatMap((group) => [group.heading, ...group.steps]),
      ...section.tips,
    ]
      .join(' ')
      .toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
