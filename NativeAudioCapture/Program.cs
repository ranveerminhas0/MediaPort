using System;
using System.IO;
using NAudio.Wave;
using System.Threading;

namespace NativeAudioCapture
{
    class Program
    {
        static void Main(string[] args)
        {
            if (args.Length < 2)
            {
                Console.WriteLine("Usage: NativeAudioCapture <durationSec> <output.wav>");
                return;
            }

            int durationSec = int.Parse(args[0]);
            string outputPath = args[1];

            try
            {
                using var capture = new WasapiLoopbackCapture();
                
                Console.WriteLine($"[NativeAudioCapture] Format: {capture.WaveFormat.SampleRate}Hz, {capture.WaveFormat.BitsPerSample}-bit, {capture.WaveFormat.Channels} channels");
                Console.WriteLine($"[NativeAudioCapture] Capturing for {durationSec} seconds...");

                using var writer = new WaveFileWriter(outputPath, capture.WaveFormat);
                
                capture.DataAvailable += (s, a) =>
                {
                    writer.Write(a.Buffer, 0, a.BytesRecorded);
                };

                capture.RecordingStopped += (s, a) =>
                {
                    writer.Dispose();
                    Console.WriteLine("[NativeAudioCapture] Recording completed.");
                };

                capture.StartRecording();
                Thread.Sleep(durationSec * 1000);
                capture.StopRecording();
                
                // Allow a brief moment for the final buffer to flush
                Thread.Sleep(500); 
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[NativeAudioCapture] Error: {ex.Message}");
            }
        }
    }
}
