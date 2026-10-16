import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { message } from '@/utils/antdAppApis';
import SliderCaptcha, { ActionType } from 'rc-slider-captcha';
import auth from '@/services/EADAF/api';

interface Props {
  onSuccess: (duration: number, trail: { x?: number; y?: number; timestamp?: number }[]) => void;
  onClose: () => void;
  captchaId: string;
}

export interface SliderCaptchaRef {
  reset: () => void;
}

const SliderCaptchaComponent = forwardRef<SliderCaptchaRef, Props>(({ onSuccess, onClose, captchaId }, ref) => {
  const captchaRef = useRef<ActionType | undefined>(undefined);
  const controlBarWidth = 320;
  const controlButtonWidth = 40;
  const indicatorBorderWidth = 2;

  useImperativeHandle(ref, () => ({
    reset: () => {
      captchaRef.current?.refresh();
    }
  }));

  return (
    <div className='d-flex justify-content-center align-items-center py-5'>
      <SliderCaptcha
        mode="slider"
        actionRef={captchaRef}
        tipText={{
          default: '请按住滑块，拖动到最右边',
          moving: '请按住滑块，拖动到最右边',
          error: '验证失败，请重新操作',
          success: '验证成功'
        }}
        errorHoldDuration={1000}
        puzzleSize={{
          left: indicatorBorderWidth,
          width: controlButtonWidth
        }}
        onVerify={async (data) => {
          if (data.x === controlBarWidth - controlButtonWidth - indicatorBorderWidth) {
            try {
              // 验证滑块位置
              const verifyResponse = await auth.captcha.postCaptchaVerify({
                captcha_id: captchaId,
                duration: data.duration,
                trail: data.trail.map(([x, y], index) => ({ 
                  x, 
                  y, 
                  timestamp: Date.now() - (data.duration * (1 - index / data.trail.length))
                })),
              });

              if (!verifyResponse.data?.verified) {
                return Promise.reject();
              }

              onSuccess(data.duration, data.trail.map(([x, y], index) => ({ 
                x, 
                y, 
                timestamp: Date.now() - (data.duration * (1 - index / data.trail.length))
              })));
              return Promise.resolve();
            } catch (error) {
              console.log(error);
              return Promise.reject();
            }
          }
          return Promise.reject();
        }}
      />
    </div>
  );
});

export default SliderCaptchaComponent; 