import { forwardRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

/**
 * TextInput that highlights its current contents when focused.
 *
 * Android's native `selectTextOnFocus` re-applies the selection every time the
 * controlled `value` changes, so the first character typed stays highlighted and
 * the next one replaces it (typing ".5" over "1" lands as "5"). Driving the
 * selection ourselves and releasing it on the first edit avoids that.
 */
const SelectAllInput = forwardRef<TextInput, TextInputProps>(function SelectAllInput(
  { value, onFocus, onBlur, onChangeText, ...props },
  ref,
) {
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);

  return (
    <TextInput
      ref={ref}
      value={value}
      selection={selection}
      onFocus={(e) => {
        setSelection({ start: 0, end: value?.length ?? 0 });
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setSelection(undefined);
        onBlur?.(e);
      }}
      onChangeText={(text) => {
        setSelection(undefined);
        onChangeText?.(text);
      }}
      {...props}
    />
  );
});

export default SelectAllInput;
