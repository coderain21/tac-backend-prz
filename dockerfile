
# Use an official Golang image to build the binary
FROM golang:1.17 AS builder

# Set the working directory
WORKDIR /app

# Install mongobetween
RUN go install github.com/coinbase/mongobetween@v0.1.0

# Use a minimal base image for the final image
FROM debian:buster-slim

# Set the working directory
WORKDIR /root/

# Copy the binary from the builder image
COPY --from=builder /go/bin/mongobetween /usr/local/bin/mongobetween

# Expose the port that mongobetween will use
EXPOSE 27017
EXPOSE 27016

# Set environment variables (if desired, can be overwritten by ECS)
ENV MONGODB_CONNECTION_STRING ""

# Define the command to run mongobetween and keep the container running
CMD ["/bin/bash", "-c", "/usr/local/bin/mongobetween ':27016=${MONGODB_CONNECTION_STRING}&maxpoolsize=1000&label=cluster0' & tail -f /dev/null"]
