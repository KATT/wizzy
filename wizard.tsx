import { useRouter } from "next/router";
import React, { createContext } from "react";
import z, { AnyZodObject, ZodType } from "zod";
import { useZodForm } from "./useZodForm";

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
  return [Context.Provider, () => React.useContext(Context)] as const;
}
function useSessionStorage(key: string) {
  return null as any;
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

  //   <Generics:Functions>
  type $SetStepDataFunction = <TStep extends $DataStep>(
    step: TStep,
    data: $Data[TStep],
  ) => void;

  type DataRequiredForStep<TStep extends $DataStep> = Record<
    TStep,
    $Data[TStep]
  > &
    Omit<NonNullable<$PartialData>, TStep>;
  type $GoToStepFunction = <TStep extends $Step>(
    step: TStep,
    ...args: TStep extends $EndStepWithData
      ? [data: DataRequiredForStep<TStep>]
      : [data?: $PartialData]
  ) => Promise<void>;
  //   </Generics:Functions>
  // </Generics>

  // <Variables>
  const allSteps: $Step[] = [...config.steps, ...config.end];

  const stepQueryKey = `${config.id}_step`;
  const dataQueryKey = `${config.id}_data`;

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
    data: $PartialData;
    setStepData: $SetStepDataFunction;
    setData: React.Dispatch<React.SetStateAction<$PartialData>>;
  }>();

  function InnerWizard(props: {
    id: string;
    start: $Step;
    data?: $PartialData;
  }) {
    // step is controlled by the url
    const router = useRouter();

    const [wizardDataInner, setWizardData] = useSessionStorage(
      config.id + "_" + props.id,
    );

    /**
     * The current step is set by the url but we make sure we cannot navigate to a step if we don't have fulfilled the data requirements for it
     *
     **/
    const queryStep = stringOrNull(router.query[config.id]);
    const requestedStep: $Step | null =
      queryStep && allSteps.includes(queryStep) ? queryStep : null;

    /**
     * Data passed through URL - always contextual to the step we're navigating too (we cannot deep link into a flow)
     */
    const queryStepData = React.useMemo(
      () => jsonParseOrNull(router.query[dataQueryKey]),
      [router.query[dataQueryKey]],
    );
    const prevStep = React.useRef<$Step | null>(null);

    let currentStep: $Step = React.useMemo(() => {
      if (queryStepData) {
        // queryStepData needs to be consumed in the context before usage
        return prevStep.current ?? props.start;
      }
      // check if requestedStep is a valid step
      if (!requestedStep || requestedStep === props.start) {
        return props.start;
      }

      const isEndStep = config.end.includes(requestedStep as any);

      if (isEndStep) {
        // for end steps we validate the data
        const schema = config.schema[requestedStep];
        if (schema && !schema.safeParse(queryStepData).success) {
          return props.start;
        }
        return requestedStep;
      }

      if (
        config.linear &&
        !config.steps.every((step, index) => {
          // check all previous steps' data requirements are fulfilled
          if (index >= allSteps.indexOf(currentStep)) {
            return true;
          }

          const schema = (config.schema as Record<string, ZodType>)[step];
          return !schema || schema.safeParse(wizardDataInner[step]).success;
        })
      ) {
        // if they arent' fulfilled, go to start step
        return props.start;
      }

      return requestedStep;
    }, []);

    useOnMount(() => {
      if (isEndStep(currentStep)) {
        // reset wizard when we reach the end step
        // resetWizard();
      }
    });

    React.useEffect(() => {
      // fix query params when clicking back after completing a step
      if (requestedStep === currentStep) {
        return;
      }

      if (queryStepData) {
        // consume query step data
        setWizardData((obj) => {
          const newObj = { ...obj };
          for (const key in queryStepData) {
            newObj[key] = {
              ...obj[key],
              ...(queryStepData[key] as Record<string, unknown>),
            };
          }

          return newObj;
        });
      }

      void router.replace({
        query: omit(router.query, stepQueryKey, dataQueryKey),
      });
    }, [router.query]);

    const transitionType =
      prevStep.current &&
      allSteps.indexOf(prevStep.current) > allSteps.indexOf(currentStep)
        ? "backward"
        : "forward";

    prevStep.current = currentStep;
    return (
      <Provider
        value={
          {
            // ...
          } as any
        }
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

  Wizard.useForm = function useForm<TStep extends $DataStep>(
    step: TStep,
    opts?: {
      defaultValues?: $PartialData[TStep];
    },
  ) {
    const schemas = config.schema as Required<TSchemaRecord>;

    const context = useContext();

    const schema = config.schema[step];
    const form = useZodForm({
      schema: schema!,
      defaultValues: {
        ...opts?.defaultValues,
        ...(context.data as any)?.[step],
      },
    });

    const setStepData = React.useCallback(() => {
      context.setStepData(step, form.getValues());
    }, []);
    useOnMount(() => {
      if (!isEndStep(step)) {
        return;
      }
      // set data on unmount
      return () => {
        setStepData();
      };
    });
    const handleSubmit = React.useCallback(
      async (values: $Data[TStep]) => {
        await form.handleSubmit(values);
        setStepData();
      },
      [form, setStepData],
    );

    return {
      form,
      handleSubmit,
    };
  };

  Wizard.useContext = function useWizard(): {
    push: $GoToStepFunction;
    setStepData: $SetStepDataFunction;
  } {
    const context = useContext();
    const router = useRouter();

    const push = React.useCallback((step: $Step, data: $PartialData) => {
      if (data) {
        context.setData((obj) => {
          const newData = { ...obj };
          // like above but using .entries and for each
          for (const [key, value] of Object.entries(data)) {
            newData[key] = {
              ...obj[key],
              ...(value as Record<string, unknown>),
            };
          }

          return newData;
        });
      }

      if (isEndStep(step) && data) {
        // validate data
        const schema = config.schema[step];
        if (!schema || !schema.safeParse(data).success) {
          // This shouldn't happen
          throw new Error("Invalid data passed to end step");
        }
        return router.push({
          query: {
            ...router.query,
            [stepQueryKey]: step,
            [dataQueryKey]: JSON.stringify(data),
          },
        });
      }
      return router.push({
        query: {
          ...router.query,
          [stepQueryKey]: step,
        },
      });
    }, []) as unknown as $GoToStepFunction;
    return {
      push,
      setStepData: context.setStepData,
    };
    throw "unimplemented";
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
