import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import {
  FieldValues,
  FormProvider,
  SubmitHandler,
  useForm,
  useFormContext,
  UseFormProps,
  UseFormReturn,
} from "react-hook-form";
import { z } from "zod";

type UseZodForm<TInput extends FieldValues> = UseFormReturn<TInput> & {
  /**
   * A unique ID for this form.
   */
  id: string;
};
export function useZodForm<TSchema extends z.ZodType>(
  props: Omit<UseFormProps<TSchema["_input"]>, "resolver"> & {
    schema: TSchema;
  },
) {
  const form = useForm<TSchema["_input"]>({
    ...props,
    resolver: zodResolver(props.schema, undefined, {
      // This makes it so we can use `.transform()`s on the schema without same transform getting applied again when it reaches the server
      raw: true,
    }),
  }) as UseZodForm<TSchema["_input"]>;

  form.id = useId();

  return form;
}