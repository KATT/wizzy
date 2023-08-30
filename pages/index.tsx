import { z } from "zod";
import { createWizard } from "../components/wizard";

/// --------------- test wizard ------------
const Test = createWizard({
  steps: ["one", "two"],
  end: ["three"],
  id: "testing",
  schema: {
    one: z.object({
      name: z.string(),
    }),
    three: z.object({
      id: z.string(),
    }),
    // @ts-expect-error TODO: not a valid step
    moo: z.object({}),
  },
  linear: true,
});

type $Types = typeof Test.$types;

// ---------------- onboarding wizard with remote storage -----
// const Onboarding = createWizard({
//   steps: ["one", "two"],
//   end: ["three"],
//   id: "onboarding",
//   schema: {
//     one: z.object({
//       name: z.string(),
//     }),
//     three: z.object({
//       applicationId: z.string(),
//     }),
//   },
//   linear: true,
//   controlled: true,
// });

export default function Index() {
  return <Test id="123" start="one" />;
}
