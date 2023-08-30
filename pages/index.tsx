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
    <Form {...form}>
      <h1>Step 1</h1>
      <input {...form.form.register("name")} />

      {form.form.formState.errors && (
        <pre>{JSON.stringify(form.form.formState.errors, null, 4)}</pre>
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
      {...form}
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
      <input {...form.form.register("message")} />
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

function Testy() {
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
