package mn.aura.couple.realtime;

import com.fasterxml.jackson.databind.JsonNode;
import java.lang.reflect.Type;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.springframework.messaging.converter.CompositeMessageConverter;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.converter.StringMessageConverter;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

/** IT-д зориулсан STOMP client: `/user/queue/events`-ийн envelope-уудыг дараалалд цуглуулна. */
public final class StompTestClient implements AutoCloseable {

    private final StompSession session;
    private final BlockingQueue<JsonNode> events = new LinkedBlockingQueue<>();
    private final BlockingQueue<String> errors = new LinkedBlockingQueue<>();

    private StompTestClient(StompSession session) {
        this.session = session;
    }

    /** CONNECT (`Authorization` нь null бол толгойгүй). Амжилтгүй бол exception. */
    public static StompTestClient connect(int port, String accessToken) throws Exception {
        WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
        client.setMessageConverter(new CompositeMessageConverter(java.util.List.of(
                new StringMessageConverter(), new MappingJackson2MessageConverter())));
        StompHeaders connect = new StompHeaders();
        if (accessToken != null) {
            connect.add("Authorization", "Bearer " + accessToken);
        }
        Holder holder = new Holder();
        StompSession session = client.connectAsync("ws://localhost:" + port + "/ws", new WebSocketHttpHeaders(),
                connect, holder).get(10, TimeUnit.SECONDS);
        StompTestClient c = new StompTestClient(session);
        holder.client = c;
        return c;
    }

    public StompTestClient subscribe(String destination) {
        session.subscribe(destination, new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return JsonNode.class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                events.add((JsonNode) payload);
            }
        });
        return this;
    }

    public StompTestClient events() {
        return subscribe("/user/queue/events");
    }

    public void send(String destination, Map<String, Object> body) {
        StompHeaders headers = new StompHeaders();
        headers.setDestination(destination);
        session.send(headers, body);
    }

    /** `type`-тэй дараагийн үйл явдал (бусдыг алгасна); хугацаанд ирэхгүй бол null. */
    public JsonNode next(String type, long millis) throws InterruptedException {
        long deadline = System.currentTimeMillis() + millis;
        while (true) {
            long left = deadline - System.currentTimeMillis();
            if (left <= 0) {
                return null;
            }
            JsonNode e = events.poll(left, TimeUnit.MILLISECONDS);
            if (e == null) {
                return null;
            }
            if (type.equals(e.path("type").asText())) {
                return e;
            }
        }
    }

    /** `millis` хугацаанд ирсэн бүх үйл явдал (нууц агуулга WS-ээр гараагүйг шалгахад). */
    public java.util.List<JsonNode> drain(long millis) throws InterruptedException {
        Thread.sleep(millis);
        java.util.List<JsonNode> out = new java.util.ArrayList<>();
        events.drainTo(out);
        return out;
    }

    public String nextError(long millis) throws InterruptedException {
        return errors.poll(millis, TimeUnit.MILLISECONDS);
    }

    public boolean connected() {
        return session.isConnected();
    }

    @Override
    public void close() {
        if (session.isConnected()) {
            try {
                session.disconnect();
            } catch (org.springframework.messaging.MessageDeliveryException e) {
                // ERROR frame-ийн дараа сервер холболтыг аль хэдийн хаасан — хаах зүйл үлдээгүй
            }
        }
    }

    private static final class Holder extends StompSessionHandlerAdapter {
        private StompTestClient client;

        @Override
        public Type getPayloadType(StompHeaders headers) {
            return String.class;
        }

        @Override
        public void handleFrame(StompHeaders headers, Object payload) {
            // ERROR frame (SUBSCRIBE/SEND татгалзсан)
            if (client != null) {
                String message = headers.getFirst("message");
                client.errors.add(message != null ? message
                        : payload == null ? StompCommand.ERROR.name() : payload.toString());
            }
        }

        @Override
        public void handleTransportError(StompSession session, Throwable exception) {
            if (client != null) {
                client.errors.add("transport: " + exception.getMessage());
            }
        }
    }
}
