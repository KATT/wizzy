import { useRouter } from "next/router";
import React, { createContext, useRef } from "react";
import z, { AnyZodObject, ZodType } from "zod";
import { useZodForm } from "./useZodForm";
import { useSessionStorage } from "usehooks-ts";
import { useMemo } from "react";
import { useEffect } from "react";
import { LinkProps } from "next/link";

export type DistributiveOmit<T, TKeys extends keyof T> = T extends unknown
  ? Omit<T, TKeys>
  : never;

/**
 * Omit keys from an object.
 * @example
 * omit({foo: 'bar', baz: '1'}, 'baz'); // -> { foo: 'bar' }
 * omit({foo: 'bar', baz: '1'}, ['baz']); // -> { foo: 'bar' }
 * omit({foo: 'bar', baz: '1'}, 'foo', 'baz'); // -> {}
 * omit({foo: 'bar', baz: '1'}, ['foo', 'baz']); // -> {}
 */
export function omit<
  TObj extends Record<string, unknown>,
  TKey extends keyof TObj,
>(obj: TObj, ...keys: TKey[] | [TKey[]]): DistributiveOmit<TObj, TKey> {
  const actualKeys: string[] = Array.isArray(keys[0])
    ? (keys[0] as string[])
    : (keys as string[]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newObj: any = Object.create(null);
  for (const key in obj) {
    if (!actualKeys.includes(key)) {
      newObj[key] = obj[key];
    }
  }
  return newObj;
}
function isString(data: unknown): data is string {
  return typeof data === "string";
}
function stringOrNull(data: unknown): null | string {
  return isString(data) ? data : null;
}
function createCtx<TContext>() {
  const Context = createContext<TContext>(null as any);
  return [
    Context.Provider,
    (): NonNullable<TContext> => {
      const value = React.useContext(Context);
      if (!value) {
        throw new Error("useContext must be used within a Provider");
      }
      return value;
    },
  ] as const;
}
function jsonParseOrNull(obj: unknown): Record<string, unknown> | null {
  if (!isString(obj)) {
    return null;
  }
  try {
    return JSON.parse(obj);
  } catch {
    // noop
  }
  return null;
}
function useOnMount(_callback: () => void | (() => void)) {}

function createWizard<
  TStepTuple extends string[],
  TEndTuple extends string[],
  TSchemaRecord extends Partial<
    Record<TStepTuple[number] | TEndTuple[number], ZodType>
  >,
  TLinear extends boolean,
>(config: {
  id: string;
  /**
   * The steps in the wizard
   * Order matters - will be used to determine the order of the steps in the wizard when e.g. going back
   */
  steps: [...TStepTuple];
  end: [...TEndTuple];
  schema: TSchemaRecord;
  /**
   * Is it a Linear flow or does it have branches
   */
  linear: TLinear;
}) {
  // <Generics>
  type AssertZodType<T> = T extends ZodType ? T : never;

  type $EndStep = TEndTuple[number];

  type $Data = {
    [TStep in keyof TSchemaRecord]: AssertZodType<
      TSchemaRecord[TStep]
    >["_input"];
  };
  type $PartialData = {
    [TStep in keyof TSchemaRecord]?: Partial<$Data[TStep]>;
  };
  type $DataStep = keyof $Data;
  type $Step = TStepTuple[number] | $EndStep | $DataStep;
  type $EndStepWithData = $EndStep & $DataStep;

  interface $StoredWizardState {
    history: $Step[];
    data: $PartialData;
  }

  //   <Generics:Functions>
  type $PatchDataFunction = (
    newData: Partial<$StoredWizardState["data"]>,
  ) => void;

  type DataRequiredForStep<TStep extends $DataStep> = Record<
    TStep,
    $Data[TStep]
  > &
    Omit<NonNullable<$PartialData>, TStep>;
  interface $GoToStepFunction {
    (
      step: $EndStepWithData,
      data: DataRequiredForStep<$EndStepWithData>,
    ): Promise<void>;
    (
      step: Exclude<$Step, $EndStepWithData>,
      data?: $PartialData,
    ): Promise<void>;
  }
  interface $GoToStepFunctionUntyped {
    (step: $Step, data?: $PartialData): Promise<void>;
  }

  //   </Generics:Functions>
  // </Generics>

  // <Variables>
  const allSteps: $Step[] = [...config.steps, ...config.end];

  const stepQueryKey = `w_${config.id}`;

  const $types = null as unknown as {
    EndStep: $EndStep;
    AnyStep: $Step;
    Data: $Data;
    DataStep: $DataStep;
  };
  // </Variables>

  function isEndStep(step: $Step): step is $EndStep {
    return config.end.includes(step as any);
  }

  const [Provider, useContext] = createCtx<{
    start: $Step;
    currentStep: $Step;
    patchData: $PatchDataFunction;
    state: $StoredWizardState;
    push: $GoToStepFunction;
  }>();

  function patchState(
    from: $StoredWizardState,
    patch: Partial<$StoredWizardState>,
  ) {
    const patchLength = Object.keys(patch).length;
    if (
      !patch ||
      patchLength === 0 ||
      (patchLength === 1 && patch.data && Object.keys(patch.data).length === 0)
    ) {
      return from;
    }
    const nextState: $StoredWizardState = {
      ...from,
      data: {
        ...from.data,
      },
    };
    const newData = patch.data;

    // patch each data entry individually
    for (const key in newData) {
      nextState.data[key] = {
        ...from.data?.[key],
        ...newData[key],
      };
    }
    return nextState;
  }

  function InnerWizard(props: {
    id: string;
    start: $Step;
    data?: $PartialData;
  }) {
    // step is controlled by the url
    const router = useRouter();

    const [innerState, setStateInner] = useSessionStorage<$StoredWizardState>(
      config.id + "_" + props.id,
      {
        history: [],
        data: props.data ?? {},
      },
    );

    const state = useMemo(() => {
      if (!props.data) {
        return innerState;
      }
      return patchState(innerState, {
        data: props.data,
      });
    }, [innerState, props.data]);

    /**
     * The current step is set by the url but we make sure we cannot navigate to a step if we don't have fulfilled the data requirements for it
     *
     **/
    const queryStep = stringOrNull(router.query[config.id]);
    const requestedStep: $Step | null =
      queryStep && allSteps.includes(queryStep) ? queryStep : null;

    const patchData: $PatchDataFunction = React.useCallback(
      (newData) => {
        setStateInner((state) => {
          return patchState(state, {
            data: newData,
          });
        });
      },
      [setStateInner],
    );

    const prevStep = React.useRef<$Step | null>(null);

    let currentStep: $Step = React.useMemo(() => {
      // check if requestedStep is a valid step
      if (!requestedStep || requestedStep === props.start) {
        return props.start;
      }

      const isEndStep = config.end.includes(requestedStep as any);

      if (isEndStep) {
        // for end steps we validate the data
        const schema = config.schema[requestedStep];
        if (schema && !schema.safeParse(state.data[requestedStep]).success) {
          return prevStep.current ?? props.start;
        }
        return requestedStep;
      }

      const currentStepIndex = allSteps.indexOf(currentStep);
      if (
        config.linear &&
        !config.steps.every((step, index) => {
          // check all previous steps' data requirements are fulfilled
          if (index <= currentStepIndex) {
            // skip current step and all previous steps
            return true;
          }

          const schema = (config.schema as Record<string, ZodType>)[step];
          return !schema || schema.safeParse(state.data[step]).success;
        })
      ) {
        // if they arent' fulfilled, go to start step
        return props.start;
      }

      return requestedStep;
    }, []);

    const queryForStep = React.useCallback(
      (step: $Step): typeof router.query => {
        return {
          ...omit(router.query, stepQueryKey),
          ...(step === props.start ? {} : { [stepQueryKey]: step }),
        };
      },
      [router.query],
    );

    const goBackLink = React.useMemo((): LinkProps => {
      const idx = allSteps.indexOf(currentStep);
      const previousStep: $Step =
        [...state.history]
          .reverse()
          .find((step) => allSteps.indexOf(step) < idx) ?? props.start;
      return {
        href: {
          query: queryForStep(previousStep),
        },
        shallow: true,
        scroll: false,
      };
    }, [state.history, currentStep, router.query]);

    const push = React.useCallback(async (step: $Step, data: $PartialData) => {
      if (data) {
        patchData(data);
      }

      if (isEndStep(step) && data) {
        // validate data
        const schema = config.schema[step];
        if (!schema || !schema.safeParse(data).success) {
          console.error(
            "Invalid data passed to end step - this shouldn't happen",
            data,
          );
          throw new Error("Invalid data passed to end step");
        }
      }
      await router.push(
        {
          query: queryForStep(step),
        },
        undefined,
        {
          shallow: true,
          scroll: false,
        },
      );
    }, []) as $GoToStepFunction;

    // update history when navigating
    React.useEffect(() => {
      setStateInner((state) => {
        const lastHistory = state.history.at(-1);
        if (lastHistory === currentStep) {
          return state;
        }

        const history =
          currentStep === props.start ? [props.start] : state.history;
        return {
          ...state,
          history,
        };
      });
    }, [currentStep]);

    React.useEffect(() => {
      // ensure the url is always in sync with the current step
      if (requestedStep === currentStep) {
        return;
      }

      void router.replace(
        {
          query: queryForStep(currentStep),
        },
        undefined,
        {
          shallow: true,
          scroll: false,
        },
      );
    }, [router.query]);

    React.useEffect(() => {
      // reset any end step data if we go to any non-end step
      const hasDataForEndSteps = config.end.some((step) => !!state.data[step]);
      if (!isEndStep(currentStep) && hasDataForEndSteps) {
        setStateInner((state) => ({
          ...state,
          data: omit(state.data, config.end),
        }));
        return;
      }
      // reset data for all steps when reaching an end step
      const hasDataForSteps = config.steps.some((step) => !!state.data[step]);
      if (isEndStep(currentStep) && hasDataForSteps) {
        setStateInner((state) => ({
          ...state,
          data: omit(state.data, config.steps),
        }));
      }
    }, [currentStep]);

    const transitionType =
      prevStep.current &&
      allSteps.indexOf(prevStep.current) > allSteps.indexOf(currentStep)
        ? "backward"
        : "forward";

    prevStep.current = currentStep;
    return (
      <Provider
        value={{
          push,
          start: props.start,
          currentStep,
          patchData,
          state: state,
        }}
      >
        {Object.entries(config.steps).map(([step, children]) => (
          <></>
          // <Wizard.Transition
          //     key={step}
          //     show={step === wizard.selected}
          //     transitionType={transitionType}
          //     >
          //         {children as React.ReactNode}
          // </Wizard.Transition>
        ))}
      </Provider>
    );
  }

  function Wizard<TStart extends $Step>(
    props: {
      id: string;
      start: TStart;
    } & (TStart extends $EndStepWithData
      ? { data: DataRequiredForStep<TStart> }
      : {
          data?: $PartialData;
        }),
  ) {
    return (
      <InnerWizard
        {...props}
        data={props.data as $PartialData}
        key={config.id + props.id}
      />
    );
  }

  Wizard.displayName = `Wizard(${config.id})`;
  Wizard.$types = $types;

  Wizard.useForm = function useForm<
    TStep extends $DataStep & TStepTuple[number],
  >(
    step: TStep,
    opts?: {
      defaultValues?: $PartialData[TStep];
    },
  ) {
    const context = useContext();

    const schema = config.schema[step];
    const form = useZodForm({
      schema: schema!,
      defaultValues: {
        ...opts?.defaultValues,
        ...context.state.data[step],
      },
    });
    const isSubmitted = useRef(false);

    useOnMount(() => {
      // set draft data on unmount
      return () => {
        if (isSubmitted.current) {
          return;
        }

        const data: $PartialData = {};
        data[step] = form.getValues();

        context.patchData(data);
      };
    });
    const handleSubmit = React.useCallback(
      async (values: $Data[TStep]) => {
        isSubmitted.current = true;
        // go to next step
        if (config.linear) {
          const nextStep = config.steps[config.steps.indexOf(step) + 1];
          if (nextStep) {
            const data: $PartialData = {};
            data[step] = values;
            await context.push(
              nextStep as Exclude<TStep, $EndStepWithData>,
              data,
            );
          }
        }
      },
      [form],
    );

    return {
      form,
      handleSubmit,
    };
  };

  Wizard.useContext = function useWizard() {
    const context = useContext();
    const router = useRouter();

    return {
      push: context.push,
      patchData: context.patchData,
    };
  };

  // Would be nicer, but reqs refactoring all forms:
  // Wizard.step = function createStep<TStep extends Step>(step: TStep, Component: Component<{
  //     data<T extends TStep>() {

  //     },
  //     form: UseZodForm<>
  // }>) {
  //     if (steps[step]) {
  //         throw new Error(`Duplicate step registered ${step}`)
  //     }

  //     Component.displayName = `WizardStep_${step}`;
  //     const isEndingStep = config.end.includes(step);

  //     steps[step] = function Step() {
  //         const context = useContext();

  //         return (
  //             <>
  //                 <Component />
  //             </>
  //         )
  //     }
  //     steps[step].displayName = `Step(${Component.displayName})`
  // }

  return Wizard;
}

const Wiz = createWizard({
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

Wiz.useForm("one", {
  defaultValues: {
    name: "test",
  },
});

const context = Wiz.useContext();
context.push("one");
context.push("two");

// @ts-expect-error no arg passed
context.push("three", {});

Wiz.$types.Data.three;

type $Types = typeof Wiz.$types;

type EndStepWithData = typeof Wiz.$types.DataStep & typeof Wiz.$types.EndStep;

function MyComponent() {
  return (
    <Wiz
      id="123"
      start="three"
      data={{
        three: {
          id: "123",
        },
      }}
    />
  );
}
