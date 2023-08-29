import React, { ComponentType, createContext } from "react";
import { useRouter } from "next/router";
import type { PartialDeep, SetRequired } from "type-fest";
import z, { ZodType } from "zod";

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

  type $Step = TStepTuple[number];
  type $EndStep = TEndTuple[number];
  type $AnyStep = $Step | $EndStep;
  type $Data = {
    [TStep in keyof TSchemaRecord]: AssertZodType<
      TSchemaRecord[TStep]
    >["_input"];
  };
  type $PartialData = PartialDeep<$Data>;
  type $DataStep = keyof $Data;
  type $EndStepWithData = $EndStep & $DataStep;

  // <  Generics:Functions>
  type $SetStepDataFunction = <TStep extends $DataStep>(
    step: TStep,
    data: $Step,
  ) => void;

  type DataRequiredForStep<TStep extends $DataStep> = Record<
    TStep,
    $Data[TStep]
  > &
    Omit<NonNullable<$PartialData>, TStep>;
  type $GoToStepFunction = <TStep extends $AnyStep>(
    step: TStep,
    ...args: TStep extends $EndStepWithData
      ? [data: DataRequiredForStep<TStep>]
      : [data?: $PartialData]
  ) => void;
  //   </Generics:Functions>
  // </Generics>

  // <Variables>
  const stepsAndEndSteps = [...config.steps, ...config.end];

  const stepQueryKey = `${config.id}_step`;
  const dataQueryKey = `${config.id}_data`;

  const $types = null as unknown as {
    Step: $Step;
    EndStep: $EndStep;
    AnyStep: $AnyStep;
    Data: $Data;
    DataStep: $DataStep;
  };
  // </Variables>

  function isEndStep(step: $AnyStep): step is $EndStep {
    return config.end.includes(step as any);
  }

  const [Provider, useContext] = createCtx<{
    start: $AnyStep;
    currentStep: $AnyStep;
    data: PartialDeep<$Data>;
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
      queryStep && stepsAndEndSteps.includes(queryStep)
        ? (queryStep as $Step)
        : null;

    /**
     * Data passed through URL - always contextual to the step we're navigating too (we cannot deep link into a flow)
     */
    const queryStepData = React.useMemo(
      () => jsonParseOrNull(router.query[dataQueryKey]),
      [router.query[dataQueryKey]],
    );
    const stepData = React.useMemo(
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
        if (schema && !schema.safeParse(stepData).success) {
          return props.start;
        }
        return requestedStep;
      }

      if (
        config.linear &&
        !config.steps.every((step, index) => {
          // check all previous steps' data requirements are fulfilled
          if (index >= config.steps.indexOf(currentStep)) {
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
      config.steps.indexOf(prevStep.current) > config.steps.indexOf(currentStep)
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
        key={props.id}
      />
    );
  }

  Wizard.displayName = `Wizard(${config.id})`;
  Wizard.$types = $types;

  Wizard.useForm = function useForm<TStep extends keyof TSchemaRecord>(
    step: TStep,
  ) {
    const schemas = config.schema as Required<TSchemaRecord>;

    const context = useContext();

    const schema = schemas[props.step];
    const form = useZodForm({
      schema,
      defaultValues: context.data?.[step],
    });

    const setStepData = React.useCallback(() => {
      context.setStepData(step, form.getValues());
    }, []);
    useOnMount(() => {
      if (!isEndStep(props.step as $Step)) {
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
      handleSubmit: opts?.handleSubmit ?? handleSubmit,
    };
  };

  Wizard.useContext = function useWizard(): {
    push: $GoToStepFunction;
  } {
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
  },
  linear: true,
});

Wiz.useForm("one", {
  async handleSubmit(values) {
    //             ^?
  },
});

const context = Wiz.useContext();
context.push("one");

// @ts-expect-error no arg passed
context.push("three", {});

Wiz.$types.Data.three;

const $Types = typeof Wiz.$types;

type EndStepWithData = typeof Wiz.$types.DataStep & typeof Wiz.$types.EndStep;

function MyComponent() {
  return <Wiz />;
}
