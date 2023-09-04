import { z } from "zod";
import { createWizard } from "../components/wizard";
import { Form, SubmitButton } from "../components/useZodForm";

/// --------------- test wizard ------------
const Test = createWizard({
  steps: ["one", "two", "three"],
  end: ["success"],
  id: "testing",
  schema: {
    one: z.object({
      name: z.string(),
    }),
    two: z.object({
      message: z.string(),
    }),

    success: z.object({
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
//   end: ["success"],
//   id: "onboarding",
//   schema: {
//     one: z.object({
//       name: z.string(),
//     }),
//     success: z.object({
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
    <Form {...form.formProps}>
      <h1>Step 2</h1>
      <input {...form.register("message")} />
      <SubmitButton>Next</SubmitButton>
    </Form>
  );
}
function Step3() {
  const wizard = Test.useContext();
  const form = Test.useForm("three");
  return (
    <Form
      {...form.formProps}
      handleSubmit={async () => {
        await form.saveState();
        wizard.push("success", {
          success: {
            id: "123",
          },
        });
      }}
    >
      <h1>Step 2</h1>
      <SubmitButton>Next</SubmitButton>
    </Form>
  );
}
function Success() {
  const wizard = Test.useContext();
  const data = wizard.get("success");

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
        success: <Success />,
      }}
    />
  );
}

const Onboarding = createWizard({
  steps: ["one", "two"],
  end: ["success"],
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
  const form = Onboarding.useForm("one");
  return (
    <Form {...form.formProps}>
      <h1>Step 1</h1>
      <input {...form.register("name")} />
      <SubmitButton>Next</SubmitButton>
    </Form>
  );
}

function OnboardingStep2() {
  const form = Onboarding.useForm("two", {
    handleSubmit() {
      context.push("success");
    },
  });
  const context = Onboarding.useContext();
  return (
    <Form {...form.formProps}>
      <h1>Step 2</h1>

      <SubmitButton>Next</SubmitButton>
    </Form>
  );
}

function OnboardingSuccess() {
  return <>Step 3</>;
}
import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon } from "@radix-ui/react-icons";
import { useState } from "react";

const DialogContent = (props: { children: React.ReactNode; name: string }) => (
  <Dialog.Root>
    <Dialog.Trigger asChild>
      <button className="Button violet">{props.name}</button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="DialogOverlay" />
      <Dialog.Content className="DialogContent">
        {/* <Dialog.Title className="DialogTitle">Edit profile</Dialog.Title>
        <Dialog.Description className="DialogDescription">
          Make changes to your profile here. Click save when you're done.
        </Dialog.Description> */}
        {props.children}
        <Dialog.Close asChild>
          <button className="IconButton" aria-label="Close">
            <Cross2Icon />
          </button>
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

function OnboardingWizard() {
  const [state, setState] = useState<
    (typeof Onboarding)["$types"]["PartialData"]
  >({});
  return (
    <Onboarding
      id="123"
      start="one"
      steps={{
        one: <OnboardingStep1 />,
        two: <OnboardingStep2 />,
        success: <OnboardingSuccess />,
      }}
      storage={{
        async patchData(data) {
          data?.one;
          console.log("patchData", data);
          // wait 1s
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          setState((state) => ({
            ...state,
            ...data,
          }));
        },
        data: state,
      }}
    />
  );
}

export default function Page() {
  return (
    <>
      <DialogContent name="TestWizard">
        <h1>Test wizard</h1>
        <TestWizard />
      </DialogContent>
      <DialogContent name="OnboardingWizard">
        <h1>Onboarding wizard</h1>
        <OnboardingWizard />
      </DialogContent>
    </>
  );
}
