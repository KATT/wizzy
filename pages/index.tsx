import { z } from "zod";
import { createWizard } from "../components/wizard";
import { Form, SubmitButton } from "../components/useZodForm";

/// --------------- test wizard ------------
const Test = createWizard({
  steps: ["one", "two"],
  end: ["three"],
  id: "testing",
  schema: {
    one: z.object({
      name: z.string(),
    }),
    two: z.object({
      message: z.string(),
    }),
    three: z.object({
      id: z.string(),
    }),
    // // @ts-expect-error TODO: not a valid step
    // moo: z.object({}),
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

function Step1() {
  const form = Test.useForm("one");

  return (
    <Form {...form.formProps}>
      <h1>Step 1</h1>
      <input {...form.register("name")} />

      {form.formState.errors && (
        <pre>{JSON.stringify(form.formState.errors, null, 4)}</pre>
      )}
      <SubmitButton>Next</SubmitButton>
    </Form>
  );
}
function Step2() {
  const wizard = Test.useContext();
  const form = Test.useForm("two");
  return (
    <Form
      {...form.formProps}
      handleSubmit={async () => {
        await form.saveState();
        wizard.push("three", {
          three: {
            id: "123",
          },
        });
      }}
    >
      <h1>Step 2</h1>
      <input {...form.register("message")} />
      <SubmitButton>Next</SubmitButton>
    </Form>
  );
}
function Step3() {
  const wizard = Test.useContext();
  const data = wizard.get("three");

  return (
    <div>
      <h1>Step 3</h1>
      <pre>{JSON.stringify(data)}</pre>
    </div>
  );
}

function TestWizard() {
  return (
    <Test
      id="123"
      start="one"
      steps={{
        one: <Step1 />,
        two: <Step2 />,
        three: <Step3 />,
      }}
    />
  );
}

const Onboarding = createWizard({
  steps: ["one", "two"],
  end: ["three"],
  id: "onboarding",
  schema: {
    one: z.object({
      name: z.string(),
    }),
  },
  linear: true,
  storage: "custom",
});

function OnboardingStep1() {
  return <>Step 1</>;
}

function OnboardingStep2() {
  return <>Step 2</>;
}

function OnboardingStep3() {
  return <>Step 3</>;
}

function OnboardingWizard() {
  return (
    <Onboarding
      id="123"
      start="three"
      steps={{
        one: <OnboardingStep1 />,
        two: <OnboardingStep2 />,
        three: <OnboardingStep3 />,
      }}
      storage={{
        patchData(data) {
          data?.one;
          console.log("patchData", data);
        },
        data: {},
      }}
    />
  );
}

export default function Page() {
  return (
    <>
      <h1>Test wizard</h1>
      <TestWizard />
      <h1>Onboarding wizard</h1>
      <OnboardingWizard />
    </>
  );
}
